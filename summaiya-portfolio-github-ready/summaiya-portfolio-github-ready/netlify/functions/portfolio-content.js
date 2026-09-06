"use strict";

const crypto =
    require("node:crypto");

const STORE_NAME =
    "summaiya-portfolio-content";

const STORE_KEY =
    "content";

const RESUME_KEY =
    "resume.pdf";

const TOKEN_LIFETIME_MS =
    4 * 60 * 60 * 1000;

const MAX_RESUME_BYTES =
    3 * 1024 * 1024;


const DEFAULT_STATE =
    Object.freeze({
        recommendations: [],
        projects: [],
        experiences: [],
        windowEntries: [],
        resume: null
    });


const ALLOWED_PROJECT_CATEGORIES =
    new Set([
        "ai",
        "ml",
        "vision",
        "software",
        "web",
        "database",
        "embedded"
    ]);


const ALLOWED_WINDOW_IDS =
    new Set([
        "about",
        "skills",
        "education",
        "awards",
        "links"
    ]);


/* =========================================================
   RESPONSE
   ========================================================= */

function json(
    statusCode,
    body
) {
    return {
        statusCode,

        headers: {
            "Content-Type":
                "application/json",

            "Cache-Control":
                "no-store",

            "X-Content-Type-Options":
                "nosniff",

            "Referrer-Policy":
                "same-origin"
        },

        body:
            JSON.stringify(
                body
            )
    };
}


/* =========================================================
   STATE
   ========================================================= */

function normalizeState(value) {
    return {
        recommendations:
            Array.isArray(
                value?.recommendations
            )
                ? value.recommendations
                : [],

        projects:
            Array.isArray(
                value?.projects
            )
                ? value.projects
                : [],

        experiences:
            Array.isArray(
                value?.experiences
            )
                ? value.experiences
                : [],

        windowEntries:
            Array.isArray(
                value?.windowEntries
            )
                ? value.windowEntries
                : [],

        resume:
            value?.resume &&
            typeof value.resume ===
                "object"
                ? value.resume
                : null
    };
}


async function getStore() {
    const module =
        await import(
            "@netlify/blobs"
        );

    return module.getStore({
        name:
            STORE_NAME,

        consistency:
            "strong"
    });
}


async function readState() {
    const store =
        await getStore();

    const stored =
        await store.get(
            STORE_KEY,
            {
                type:
                    "json",

                consistency:
                    "strong"
            }
        );

    return {
        store,

        state:
            normalizeState(
                stored ||
                DEFAULT_STATE
            )
    };
}


async function writeState(
    store,
    state
) {
    await store.setJSON(
        STORE_KEY,
        normalizeState(
            state
        )
    );
}


/* =========================================================
   VALIDATION
   ========================================================= */

function cleanString(
    value,
    maxLength
) {
    return String(
        value ?? ""
    )
        .replace(
            /\u0000/g,
            ""
        )
        .trim()
        .slice(
            0,
            maxLength
        );
}


function requireLength(
    value,
    minimum,
    maximum,
    label
) {
    const text =
        cleanString(
            value,
            maximum
        );

    if (
        text.length <
        minimum
    ) {
        throw new Error(
            `${label} is too short.`
        );
    }

    return text;
}


function parseCommaList(
    value,
    maxItems = 12
) {
    return cleanString(
        value,
        400
    )
        .split(",")
        .map(
            (item) =>
                item.trim()
        )
        .filter(Boolean)
        .slice(
            0,
            maxItems
        );
}


function validateUrl(
    value,
    label = "Link"
) {
    const text =
        cleanString(
            value,
            500
        );

    if (!text) {
        return "";
    }

    let url;

    try {
        url =
            new URL(
                text
            );
    } catch {
        throw new Error(
            `${label} must be a valid URL.`
        );
    }

    if (
        !/^https?:$/.test(
            url.protocol
        )
    ) {
        throw new Error(
            `${label} must use http or https.`
        );
    }

    return url.toString();
}


/* =========================================================
   ADMIN AUTH
   ========================================================= */

function hash(value) {
    return crypto
        .createHash(
            "sha256"
        )
        .update(
            String(value)
        )
        .digest();
}


function secureEquals(
    first,
    second
) {
    return crypto.timingSafeEqual(
        hash(first),
        hash(second)
    );
}


function getAdminPassword() {
    return String(
        process.env
            .PORTFOLIO_ADMIN_PASSWORD ||
        ""
    );
}


function issueAdminToken() {
    const password =
        getAdminPassword();

    if (!password) {
        throw new Error(
            "Admin password is not configured."
        );
    }

    const payload =
        Buffer.from(
            JSON.stringify({
                exp:
                    Date.now() +
                    TOKEN_LIFETIME_MS,

                nonce:
                    crypto.randomUUID()
            })
        ).toString(
            "base64url"
        );

    const signature =
        crypto
            .createHmac(
                "sha256",
                password
            )
            .update(
                payload
            )
            .digest(
                "base64url"
            );

    return `${payload}.${signature}`;
}


function verifyAdminToken(token) {
    const password =
        getAdminPassword();

    if (
        !password ||
        typeof token !==
            "string"
    ) {
        return false;
    }

    const [
        payload,
        signature
    ] =
        token.split(".");

    if (
        !payload ||
        !signature
    ) {
        return false;
    }

    const expected =
        crypto
            .createHmac(
                "sha256",
                password
            )
            .update(
                payload
            )
            .digest(
                "base64url"
            );

    if (
        !secureEquals(
            signature,
            expected
        )
    ) {
        return false;
    }

    try {
        const parsed =
            JSON.parse(
                Buffer
                    .from(
                        payload,
                        "base64url"
                    )
                    .toString(
                        "utf8"
                    )
            );

        return (
            Number(
                parsed.exp
            ) >
            Date.now()
        );

    } catch {
        return false;
    }
}


function getBearerToken(event) {
    const header =
        event.headers
            ?.authorization ||
        event.headers
            ?.Authorization ||
        "";

    return header.startsWith(
        "Bearer "
    )
        ? header
            .slice(7)
            .trim()
        : "";
}


function requireAdmin(event) {
    if (
        !verifyAdminToken(
            getBearerToken(
                event
            )
        )
    ) {
        const error =
            new Error(
                "Unauthorized."
            );

        error.statusCode =
            401;

        throw error;
    }
}


/* =========================================================
   PUBLIC STATE
   ========================================================= */

function publicState(state) {
    return {
        recommendations:
            state
                .recommendations
                .filter(
                    (item) =>
                        item.status ===
                        "approved"
                )
                .map(
                    ({
                        id,
                        name,
                        role,
                        text,
                        createdAt,
                        approvedAt
                    }) => ({
                        id,
                        name,
                        role,
                        text,
                        createdAt,
                        approvedAt
                    })
                ),

        projects:
            state.projects,

        experiences:
            state.experiences,

        windowEntries:
            state.windowEntries,

        resume:
            state.resume
                ? {
                    name:
                        state.resume.name,

                    size:
                        state.resume.size,

                    updatedAt:
                        state.resume.updatedAt
                }
                : null
    };
}


/* =========================================================
   RESUME
   ========================================================= */

async function serveResume() {
    const {
        store,
        state
    } =
        await readState();

    if (!state.resume) {
        return json(
            404,
            {
                error:
                    "No uploaded resume is available."
            }
        );
    }

    const value =
        await store.get(
            RESUME_KEY,
            {
                type:
                    "arrayBuffer",

                consistency:
                    "strong"
            }
        );

    if (!value) {
        return json(
            404,
            {
                error:
                    "Uploaded resume could not be found."
            }
        );
    }

    const filename =
        cleanString(
            state.resume.name ||
            "Summaiya_Shoaib_CV.pdf",
            180
        )
            .replace(
                /["\\\r\n]/g,
                "_"
            );

    return {
        statusCode:
            200,

        isBase64Encoded:
            true,

        headers: {
            "Content-Type":
                "application/pdf",

            "Content-Disposition":
                `inline; filename="${filename}"`,

            "Cache-Control":
                "public, max-age=300",

            "X-Content-Type-Options":
                "nosniff"
        },

        body:
            Buffer.from(
                value
            ).toString(
                "base64"
            )
    };
}


/* =========================================================
   ACTIONS
   ========================================================= */

async function handlePost(event) {
    let payload;

    try {
        payload =
            JSON.parse(
                event.body ||
                "{}"
            );
    } catch {
        return json(
            400,
            {
                error:
                    "Invalid request body."
            }
        );
    }

    const action =
        cleanString(
            payload.action,
            80
        );


    /* ==========================
       LOGIN
       ========================== */

    if (
        action ===
        "login"
    ) {
        const configuredPassword =
            getAdminPassword();

        if (!configuredPassword) {
            return json(
                500,
                {
                    error:
                        "Admin access is not configured yet."
                }
            );
        }

        if (
            !secureEquals(
                payload.password ||
                "",
                configuredPassword
            )
        ) {
            return json(
                401,
                {
                    error:
                        "Incorrect password."
                }
            );
        }

        return json(
            200,
            {
                token:
                    issueAdminToken(),

                expiresIn:
                    TOKEN_LIFETIME_MS
            }
        );
    }


    /* ==========================
       PUBLIC REVIEW
       ========================== */

    if (
        action ===
        "submitRecommendation"
    ) {
        if (
            cleanString(
                payload.website,
                200
            )
        ) {
            return json(
                200,
                {
                    ok: true
                }
            );
        }

        let name;
        let text;

        try {
            name =
                requireLength(
                    payload.name,
                    2,
                    80,
                    "Name"
                );

            text =
                requireLength(
                    payload.text,
                    20,
                    1000,
                    "Recommendation"
                );
        } catch (error) {
            return json(
                400,
                {
                    error:
                        error.message
                }
            );
        }

        const role =
            cleanString(
                payload.role,
                120
            );

        const {
            store,
            state
        } =
            await readState();

        state.recommendations
            .unshift({
                id:
                    crypto.randomUUID(),

                name,

                role,

                text,

                status:
                    "pending",

                createdAt:
                    new Date()
                        .toISOString(),

                approvedAt:
                    null
            });

        state.recommendations =
            state
                .recommendations
                .slice(
                    0,
                    500
                );

        await writeState(
            store,
            state
        );

        return json(
            201,
            {
                ok: true,

                status:
                    "pending"
            }
        );
    }


    /* ==========================
       ADMIN REQUIRED BELOW
       ========================== */

    requireAdmin(
        event
    );

    const {
        store,
        state
    } =
        await readState();


    if (
        action ===
        "adminList"
    ) {
        return json(
            200,
            state
        );
    }


    /* ==========================
       ADD PROJECT
       ========================== */

    if (
        action ===
        "addProject"
    ) {
        let title;
        let summary;
        let demoUrl;

        try {
            title =
                requireLength(
                    payload.title,
                    2,
                    100,
                    "Project title"
                );

            summary =
                requireLength(
                    payload.summary,
                    20,
                    700,
                    "Project summary"
                );

            demoUrl =
                validateUrl(
                    payload.demoUrl,
                    "Demo link"
                );

        } catch (error) {
            return json(
                400,
                {
                    error:
                        error.message
                }
            );
        }

        const category =
            ALLOWED_PROJECT_CATEGORIES
                .has(
                    payload.category
                )
                ? payload.category
                : "software";

        state.projects.push({
            id:
                crypto.randomUUID(),

            title,

            category,

            summary,

            tools:
                parseCommaList(
                    payload.tools,
                    12
                ),

            demoUrl,

            createdAt:
                new Date()
                    .toISOString()
        });

        state.projects =
            state.projects
                .slice(
                    -200
                );

        await writeState(
            store,
            state
        );

        return json(
            201,
            {
                ok: true
            }
        );
    }


    /* ==========================
       ADD EXPERIENCE
       ========================== */

    if (
        action ===
        "addExperience"
    ) {
        let role;
        let organization;
        let dates;
        let description;

        try {
            role =
                requireLength(
                    payload.role,
                    2,
                    100,
                    "Role"
                );

            organization =
                requireLength(
                    payload.organization,
                    2,
                    120,
                    "Organization"
                );

            dates =
                requireLength(
                    payload.dates,
                    2,
                    80,
                    "Dates"
                );

            description =
                requireLength(
                    payload.description,
                    20,
                    700,
                    "Description"
                );

        } catch (error) {
            return json(
                400,
                {
                    error:
                        error.message
                }
            );
        }

        state.experiences.push({
            id:
                crypto.randomUUID(),

            role,

            organization,

            dates,

            description,

            createdAt:
                new Date()
                    .toISOString()
        });

        state.experiences =
            state.experiences
                .slice(
                    -200
                );

        await writeState(
            store,
            state
        );

        return json(
            201,
            {
                ok: true
            }
        );
    }


    /* ==========================
       ADD CONTENT TO WINDOW
       ========================== */

    if (
        action ===
        "addWindowEntry"
    ) {
        const windowId =
            cleanString(
                payload.windowId,
                30
            );

        if (
            !ALLOWED_WINDOW_IDS
                .has(
                    windowId
                )
        ) {
            return json(
                400,
                {
                    error:
                        "That window cannot be updated from the admin panel."
                }
            );
        }

        let title;
        let description;
        let linkUrl;

        try {
            title =
                requireLength(
                    payload.title,
                    2,
                    120,
                    "Title"
                );

            description =
                requireLength(
                    payload.description,
                    5,
                    900,
                    "Description"
                );

            linkUrl =
                validateUrl(
                    payload.linkUrl,
                    "Link"
                );

        } catch (error) {
            return json(
                400,
                {
                    error:
                        error.message
                }
            );
        }

        state.windowEntries.push({
            id:
                crypto.randomUUID(),

            windowId,

            title,

            subtitle:
                cleanString(
                    payload.subtitle,
                    160
                ),

            description,

            tags:
                parseCommaList(
                    payload.tags,
                    12
                ),

            linkUrl,

            createdAt:
                new Date()
                    .toISOString()
        });

        state.windowEntries =
            state.windowEntries
                .slice(
                    -300
                );

        await writeState(
            store,
            state
        );

        return json(
            201,
            {
                ok: true
            }
        );
    }


    /* ==========================
       UPLOAD RESUME
       ========================== */

    if (
        action ===
        "uploadResume"
    ) {
        const name =
            cleanString(
                payload.name ||
                "Summaiya_Shoaib_CV.pdf",
                180
            );

        const mime =
            cleanString(
                payload.mime,
                80
            );

        const base64 =
            cleanString(
                payload.base64,
                6 * 1024 * 1024
            );

        if (
            mime !==
            "application/pdf"
        ) {
            return json(
                400,
                {
                    error:
                        "Resume must be a PDF."
                }
            );
        }

        let buffer;

        try {
            buffer =
                Buffer.from(
                    base64,
                    "base64"
                );
        } catch {
            return json(
                400,
                {
                    error:
                        "Resume data could not be read."
                }
            );
        }

        if (
            !buffer.length ||
            buffer.length >
                MAX_RESUME_BYTES
        ) {
            return json(
                400,
                {
                    error:
                        "Resume PDF must be under 3 MB."
                }
            );
        }

        if (
            buffer
                .subarray(
                    0,
                    5
                )
                .toString(
                    "ascii"
                ) !==
            "%PDF-"
        ) {
            return json(
                400,
                {
                    error:
                        "The uploaded file does not appear to be a valid PDF."
                }
            );
        }

        await store.set(
            RESUME_KEY,
            buffer
        );

        state.resume = {
            name:
                name
                    .toLowerCase()
                    .endsWith(
                        ".pdf"
                    )
                    ? name
                    : `${name}.pdf`,

            size:
                buffer.length,

            updatedAt:
                new Date()
                    .toISOString()
        };

        await writeState(
            store,
            state
        );

        return json(
            201,
            {
                ok: true,

                resume:
                    state.resume
            }
        );
    }


    /* ==========================
       REVIEW STATUS
       ========================== */

    if (
        action ===
        "setRecommendationStatus"
    ) {
        const id =
            cleanString(
                payload.id,
                100
            );

        const status =
            payload.status ===
            "approved"
                ? "approved"
                : "pending";

        const item =
            state.recommendations.find(
                (entry) =>
                    entry.id ===
                    id
            );

        if (!item) {
            return json(
                404,
                {
                    error:
                        "Recommendation not found."
                }
            );
        }

        item.status =
            status;

        item.approvedAt =
            status ===
            "approved"
                ? new Date()
                    .toISOString()
                : null;

        await writeState(
            store,
            state
        );

        return json(
            200,
            {
                ok: true
            }
        );
    }


    /* ==========================
       DELETE
       ========================== */

    if (
        action ===
            "deleteRecommendation" ||
        action ===
            "deleteProject" ||
        action ===
            "deleteExperience" ||
        action ===
            "deleteWindowEntry"
    ) {
        const id =
            cleanString(
                payload.id,
                100
            );

        if (
            action ===
            "deleteRecommendation"
        ) {
            state.recommendations =
                state.recommendations.filter(
                    (item) =>
                        item.id !==
                        id
                );
        }

        if (
            action ===
            "deleteProject"
        ) {
            state.projects =
                state.projects.filter(
                    (item) =>
                        item.id !==
                        id
                );
        }

        if (
            action ===
            "deleteExperience"
        ) {
            state.experiences =
                state.experiences.filter(
                    (item) =>
                        item.id !==
                        id
                );
        }

        if (
            action ===
            "deleteWindowEntry"
        ) {
            state.windowEntries =
                state.windowEntries.filter(
                    (item) =>
                        item.id !==
                        id
                );
        }

        await writeState(
            store,
            state
        );

        return json(
            200,
            {
                ok: true
            }
        );
    }

    return json(
        400,
        {
            error:
                "Unknown action."
        }
    );
}


/* =========================================================
   NETLIFY HANDLER
   ========================================================= */

exports.handler =
    async function (event) {
        if (
            event.httpMethod ===
            "OPTIONS"
        ) {
            return {
                statusCode:
                    204,

                headers: {
                    "Access-Control-Allow-Methods":
                        "GET, POST, OPTIONS",

                    "Access-Control-Allow-Headers":
                        "Content-Type, Authorization"
                },

                body: ""
            };
        }

        try {
            if (
                event.httpMethod ===
                "GET"
            ) {
                if (
                    event
                        .queryStringParameters
                        ?.asset ===
                    "resume"
                ) {
                    return await serveResume();
                }

                const {
                    state
                } =
                    await readState();

                return json(
                    200,
                    publicState(
                        state
                    )
                );
            }

            if (
                event.httpMethod ===
                "POST"
            ) {
                return await handlePost(
                    event
                );
            }

            return json(
                405,
                {
                    error:
                        "Method not allowed."
                }
            );

        } catch (error) {
            console.error(
                "Portfolio content error:",
                error
            );

            return json(
                error.statusCode ||
                500,
                {
                    error:
                        error.statusCode ===
                        401
                            ? "Unauthorized."
                            : "Portfolio content service encountered an error."
                }
            );
        }
    };