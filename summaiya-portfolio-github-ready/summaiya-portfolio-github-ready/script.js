"use strict";

/* =========================================================
   SUMMAIYA SHOAIB ARCHIVE OS
   Window system + mail + arcade + reviews/admin
   ========================================================= */

const WINDOW_SELECTOR = ".os-window";
const HIDDEN_CLASS = "is-hidden";
const PORTFOLIO_CONTENT_ENDPOINT = "/.netlify/functions/portfolio-content";
const WINDOW_BOTTOM_GAP = 8;

let activeWindowId = null;
let highestZIndex = 200;
let clockInterval = null;
let audioContext = null;
let portfolioAdminToken =
    sessionStorage.getItem("portfolioAdminToken") || "";

let publicPortfolioContent = {
    recommendations: [],
    projects: [],
    experiences: [],
    windowEntries: [],
    resume: null
};

const game = {
    canvas: null,
    context: null,
    running: false,
    paused: false,
    animationFrame: null,
    lastTime: 0,
    score: 0,
    lives: 3,

    keys: {
        left: false,
        right: false
    },

    player: {
        x: 275,
        y: 282,
        width: 90,
        height: 18,
        speed: 340
    },

    objects: [],
    spawnTimer: 0.5
};


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeWindows();
    initializeClock();
    initializeWindowFocus();
    initializeWindowDragging();
    initializeKeyboardControls();
    initializeMailClient();
    initializeGame();
    initializeClickSounds();
    initializeReviewsAndAdmin();
    runFastBootSequence();

    window.addEventListener(
        "resize",
        keepAllWindowsInsideViewport
    );

    window.addEventListener("blur", () => {
        game.keys.left = false;
        game.keys.right = false;
    });
});


/* =========================================================
   BOOT
   ========================================================= */

function runFastBootSequence() {
    const bootScreen =
        document.getElementById("boot-screen");

    const desktop =
        document.getElementById("desktop");

    const progressFill =
        document.getElementById("boot-progress-fill");

    if (!desktop) {
        return;
    }

    desktop.classList.add(HIDDEN_CLASS);
    bootScreen?.classList.remove(HIDDEN_CLASS);

    const duration = 320;
    const start = performance.now();

    function frame(now) {
        const progress = Math.min(
            (now - start) / duration,
            1
        );

        if (progressFill) {
            progressFill.style.width =
                `${Math.round(progress * 100)}%`;
        }

        if (progress < 1) {
            requestAnimationFrame(frame);
            return;
        }

        bootScreen?.classList.add(HIDDEN_CLASS);
        desktop.classList.remove(HIDDEN_CLASS);

        requestAnimationFrame(() => {
            openWindow("overview");
            keepAllWindowsInsideViewport();
        });
    }

    requestAnimationFrame(frame);
}


/* =========================================================
   WINDOWS
   ========================================================= */

function initializeWindows() {
    document
        .querySelectorAll(WINDOW_SELECTOR)
        .forEach((windowElement) => {
            windowElement.dataset.windowState =
                "closed";

            windowElement.dataset.active =
                "false";

            windowElement.setAttribute(
                "aria-hidden",
                "true"
            );
        });

    updateTaskbar();
    updateActiveWindowLabel();
}


function getWindowElement(windowId) {
    const element =
        document.getElementById(windowId);

    return element?.matches(WINDOW_SELECTOR)
        ? element
        : null;
}


function openWindow(windowId) {
    const element =
        getWindowElement(windowId);

    if (!element) {
        return;
    }

    element.classList.remove(HIDDEN_CLASS);

    element.dataset.windowState =
        "open";

    element.setAttribute(
        "aria-hidden",
        "false"
    );

    if (windowId === "projects") {
        enterProjectsFocus();
    }

    bringWindowToFront(element);
    keepWindowInsideViewport(element);

    requestAnimationFrame(() => {
        try {
            element.focus({
                preventScroll: true
            });
        } catch {
            element.focus();
        }
    });

    if (windowId === "arcade") {
        drawGamePreview();
    }

    if (windowId === "recommendations") {
        loadPublicPortfolioContent();
    }

    if (
        windowId === "admin-panel" &&
        portfolioAdminToken
    ) {
        loadAdminDashboard();
    }
}


function closeWindow(windowId) {
    const element =
        getWindowElement(windowId);

    if (!element) {
        return;
    }

    if (windowId === "projects") {
        exitProjectsFocus();
    }

    if (windowId === "arcade") {
        stopGame();

        showGameOverlay(
            "Archive Catch",
            "Use the left and right arrow keys to catch stars. Avoid the dark blocks.",
            "Play Game"
        );

        drawGamePreview();
    }

    element.classList.add(HIDDEN_CLASS);

    element.dataset.windowState =
        "closed";

    element.dataset.active =
        "false";

    element.setAttribute(
        "aria-hidden",
        "true"
    );

    if (activeWindowId === windowId) {
        activeWindowId = null;
        activateHighestVisibleWindow();
    }

    updateTaskbar();
    updateActiveWindowLabel();
}


function minimizeWindow(windowId) {
    const element =
        getWindowElement(windowId);

    if (!element) {
        return;
    }

    if (windowId === "projects") {
        exitProjectsFocus();
    }

    if (
        windowId === "arcade" &&
        game.running &&
        !game.paused
    ) {
        game.paused = true;

        updateGameStatus(
            "PAUSED"
        );

        updatePauseButton();
    }

    element.classList.add(HIDDEN_CLASS);

    element.dataset.windowState =
        "minimized";

    element.dataset.active =
        "false";

    element.setAttribute(
        "aria-hidden",
        "true"
    );

    if (activeWindowId === windowId) {
        activeWindowId = null;
        activateHighestVisibleWindow();
    }

    updateTaskbar();
    updateActiveWindowLabel();
}


/* =========================================================
   WINDOW FOCUS
   ========================================================= */

function initializeWindowFocus() {
    document
        .querySelectorAll(WINDOW_SELECTOR)
        .forEach((element) => {
            element.addEventListener(
                "pointerdown",
                () => {
                    if (
                        !element.classList.contains(
                            HIDDEN_CLASS
                        )
                    ) {
                        bringWindowToFront(
                            element
                        );
                    }
                }
            );
        });
}


function bringWindowToFront(element) {
    if (!element) {
        return;
    }

    highestZIndex += 1;

    if (highestZIndex > 8000) {
        normalizeZIndexes();
    }

    document
        .querySelectorAll(WINDOW_SELECTOR)
        .forEach((other) => {
            other.dataset.active =
                "false";
        });

    element.style.zIndex =
        String(highestZIndex);

    element.dataset.active =
        "true";

    activeWindowId =
        element.id;

    updateTaskbar();
    updateActiveWindowLabel();
}


function getVisibleWindows() {
    return [
        ...document.querySelectorAll(
            WINDOW_SELECTOR
        )
    ].filter(
        (element) =>
            !element.classList.contains(
                HIDDEN_CLASS
            ) &&
            element.dataset.windowState ===
                "open"
    );
}


function getWindowZIndex(element) {
    const value =
        Number.parseInt(
            getComputedStyle(
                element
            ).zIndex,
            10
        );

    return Number.isNaN(value)
        ? 0
        : value;
}


function activateHighestVisibleWindow() {
    const visible =
        getVisibleWindows();

    if (!visible.length) {
        activeWindowId = null;

        updateTaskbar();
        updateActiveWindowLabel();

        return;
    }

    visible.sort(
        (a, b) =>
            getWindowZIndex(a) -
            getWindowZIndex(b)
    );

    bringWindowToFront(
        visible[
            visible.length - 1
        ]
    );
}


function normalizeZIndexes() {
    const visible =
        getVisibleWindows().sort(
            (a, b) =>
                getWindowZIndex(a) -
                getWindowZIndex(b)
        );

    visible.forEach(
        (element, index) => {
            element.style.zIndex =
                String(
                    200 +
                    index
                );
        }
    );

    highestZIndex =
        200 +
        visible.length;
}


/* =========================================================
   DRAGGING
   ========================================================= */

function initializeWindowDragging() {
    document
        .querySelectorAll(WINDOW_SELECTOR)
        .forEach((element) => {
            const titlebar =
                element.querySelector(
                    ".window-titlebar"
                );

            if (!titlebar) {
                return;
            }

            titlebar.addEventListener(
                "pointerdown",
                (event) => {
                    if (
                        event.button !== 0 ||
                        event.target.closest(
                            ".window-controls, button, a, input, textarea, select"
                        )
                    ) {
                        return;
                    }

                    startDraggingWindow(
                        event,
                        element,
                        titlebar
                    );
                }
            );
        });
}


function startDraggingWindow(
    event,
    element,
    titlebar
) {
    event.preventDefault();

    bringWindowToFront(
        element
    );

    const rect =
        element.getBoundingClientRect();

    const startX =
        event.clientX;

    const startY =
        event.clientY;

    const pointerId =
        event.pointerId;

    titlebar.setPointerCapture(
        pointerId
    );

    function move(moveEvent) {
        if (
            moveEvent.pointerId !==
            pointerId
        ) {
            return;
        }

        const position =
            getRestrictedWindowPosition(
                element,
                rect.left +
                    moveEvent.clientX -
                    startX,
                rect.top +
                    moveEvent.clientY -
                    startY
            );

        element.style.left =
            `${position.left}px`;

        element.style.top =
            `${position.top}px`;

        element.style.right =
            "auto";

        element.style.bottom =
            "auto";
    }

    function stop(stopEvent) {
        if (
            stopEvent.pointerId !==
            pointerId
        ) {
            return;
        }

        titlebar.removeEventListener(
            "pointermove",
            move
        );

        titlebar.removeEventListener(
            "pointerup",
            stop
        );

        titlebar.removeEventListener(
            "pointercancel",
            stop
        );

        if (
            titlebar.hasPointerCapture(
                pointerId
            )
        ) {
            titlebar.releasePointerCapture(
                pointerId
            );
        }

        keepWindowInsideViewport(
            element
        );
    }

    titlebar.addEventListener(
        "pointermove",
        move
    );

    titlebar.addEventListener(
        "pointerup",
        stop
    );

    titlebar.addEventListener(
        "pointercancel",
        stop
    );
}


function getRestrictedWindowPosition(
    element,
    desiredLeft,
    desiredTop
) {
    const bannerHeight =
        document.querySelector(
            ".desktop-banner"
        )?.offsetHeight || 40;

    const taskbarHeight =
        document.getElementById(
            "taskbar"
        )?.offsetHeight || 54;

    const viewportWidth =
        window.visualViewport?.width ||
        window.innerWidth;

    const viewportHeight =
        window.visualViewport?.height ||
        window.innerHeight;

    const minimumTop =
        bannerHeight + 3;

    const maximumLeft =
        Math.max(
            0,
            viewportWidth -
                element.offsetWidth
        );

    const maximumTop =
        Math.max(
            minimumTop,
            viewportHeight -
                taskbarHeight -
                WINDOW_BOTTOM_GAP -
                element.offsetHeight
        );

    return {
        left:
            clamp(
                desiredLeft,
                0,
                maximumLeft
            ),

        top:
            clamp(
                desiredTop,
                minimumTop,
                maximumTop
            )
    };
}


function keepWindowInsideViewport(element) {
    if (
        !element ||
        element.classList.contains(
            HIDDEN_CLASS
        )
    ) {
        return;
    }

    const rect =
        element.getBoundingClientRect();

    const position =
        getRestrictedWindowPosition(
            element,
            rect.left,
            rect.top
        );

    element.style.left =
        `${position.left}px`;

    element.style.top =
        `${position.top}px`;

    element.style.right =
        "auto";

    element.style.bottom =
        "auto";
}


function keepAllWindowsInsideViewport() {
    document
        .querySelectorAll(
            WINDOW_SELECTOR
        )
        .forEach(
            keepWindowInsideViewport
        );
}


function clamp(value, min, max) {
    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );
}


/* =========================================================
   TASKBAR + CLOCK
   ========================================================= */

function updateTaskbar() {
    document
        .querySelectorAll(
            ".taskbar-app[data-window-id]"
        )
        .forEach((button) => {
            const id =
                button.dataset.windowId;

            const element =
                document.getElementById(
                    id
                );

            const active =
                Boolean(
                    element &&
                    !element.classList.contains(
                        HIDDEN_CLASS
                    ) &&
                    element.dataset.active ===
                        "true"
                );

            button.classList.toggle(
                "is-active",
                active
            );
        });
}


function updateActiveWindowLabel() {
    const label =
        document.getElementById(
            "active-window-label"
        );

    if (!label) {
        return;
    }

    if (!activeWindowId) {
        label.textContent =
            "Desktop";

        return;
    }

    const title =
        document
            .getElementById(
                activeWindowId
            )
            ?.querySelector(
                ".window-title span"
            );

    label.textContent =
        title?.textContent.trim() ||
        "Desktop";
}


function initializeClock() {
    updateClock();

    if (clockInterval) {
        clearInterval(
            clockInterval
        );
    }

    clockInterval =
        setInterval(
            updateClock,
            1000
        );
}


function updateClock() {
    const clock =
        document.getElementById(
            "clock"
        );

    if (!clock) {
        return;
    }

    const now =
        new Date();

    clock.textContent =
        now.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    clock.dateTime =
        now.toISOString();

    clock.title =
        now.toLocaleString();
}


/* =========================================================
   CLICK SOUND
   ========================================================= */

function initializeClickSounds() {
    document.addEventListener(
        "pointerdown",
        (event) => {
            if (
                event.target.closest(
                    "button:not(:disabled), a[href], input, textarea, select"
                )
            ) {
                playClickSound();
            }
        }
    );
}


function playClickSound() {
    try {
        const AudioContextClass =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContextClass) {
            return;
        }

        if (!audioContext) {
            audioContext =
                new AudioContextClass();
        }

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        oscillator.type =
            "square";

        oscillator.frequency.value =
            380;

        gain.gain.setValueAtTime(
            0.025,
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.001,
            audioContext.currentTime +
                0.04
        );

        oscillator.connect(
            gain
        );

        gain.connect(
            audioContext.destination
        );

        oscillator.start();

        oscillator.stop(
            audioContext.currentTime +
                0.04
        );
    } catch {
        /* Optional sound. */
    }
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function initializeKeyboardControls() {
    document.addEventListener(
        "keydown",
        (event) => {
            if (
                isTypingElement(
                    event.target
                )
            ) {
                return;
            }

            const arcade =
                document.getElementById(
                    "arcade"
                );

            const arcadeVisible =
                arcade &&
                !arcade.classList.contains(
                    HIDDEN_CLASS
                );

            const key =
                event.key.toLowerCase();

            if (arcadeVisible) {
                if (
                    event.key ===
                        "ArrowLeft" ||
                    key ===
                        "a"
                ) {
                    game.keys.left =
                        true;

                    event.preventDefault();
                }

                if (
                    event.key ===
                        "ArrowRight" ||
                    key ===
                        "d"
                ) {
                    game.keys.right =
                        true;

                    event.preventDefault();
                }

                if (
                    key === "p" &&
                    game.running
                ) {
                    toggleGamePause();

                    event.preventDefault();
                }
            }

            if (
                event.key ===
                    "Escape" &&
                activeWindowId
            ) {
                closeWindow(
                    activeWindowId
                );
            }
        }
    );

    document.addEventListener(
        "keyup",
        (event) => {
            const key =
                event.key.toLowerCase();

            if (
                event.key ===
                    "ArrowLeft" ||
                key ===
                    "a"
            ) {
                game.keys.left =
                    false;
            }

            if (
                event.key ===
                    "ArrowRight" ||
                key ===
                    "d"
            ) {
                game.keys.right =
                    false;
            }
        }
    );
}


function isTypingElement(element) {
    return Boolean(
        element &&
        (
            element.tagName ===
                "INPUT" ||
            element.tagName ===
                "TEXTAREA" ||
            element.tagName ===
                "SELECT" ||
            element.isContentEditable
        )
    );
}


/* =========================================================
   MAIL
   ========================================================= */

function initializeMailClient() {
    document
        .getElementById(
            "mail-form"
        )
        ?.addEventListener(
            "submit",
            submitMailForm
        );

    document
        .getElementById(
            "mail-reset"
        )
        ?.addEventListener(
            "click",
            resetMailClient
        );
}


async function submitMailForm(event) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const button =
        document.getElementById(
            "mail-submit"
        );

    const status =
        document.getElementById(
            "mail-status"
        );

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (button) {
        button.disabled =
            true;

        button.textContent =
            "Sending...";
    }

    if (status) {
        status.textContent =
            "Connecting to mail server...";
    }

    try {
        const response =
            await fetch(
                form.action,
                {
                    method:
                        form.method,

                    body:
                        new FormData(
                            form
                        ),

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                "Message could not be sent."
            );
        }

        form.reset();

        document
            .getElementById(
                "mail-compose"
            )
            ?.classList.add(
                HIDDEN_CLASS
            );

        document
            .getElementById(
                "mail-success"
            )
            ?.classList.remove(
                HIDDEN_CLASS
            );

        if (status) {
            status.textContent =
                "";
        }
    } catch {
        if (status) {
            status.textContent =
                "Message could not be sent. Email me at sumshoaib2019@gmail.com.";
        }
    } finally {
        if (button) {
            button.disabled =
                false;

            button.textContent =
                "Send Message";
        }
    }
}


function resetMailClient() {
    document
        .getElementById(
            "mail-form"
        )
        ?.reset();

    document
        .getElementById(
            "mail-success"
        )
        ?.classList.add(
            HIDDEN_CLASS
        );

    document
        .getElementById(
            "mail-compose"
        )
        ?.classList.remove(
            HIDDEN_CLASS
        );

    document
        .getElementById(
            "mail-email"
        )
        ?.focus();
}


function printResume() {
    openWindow(
        "resume"
    );

    setTimeout(
        () =>
            window.print(),
        100
    );
}


/* =========================================================
   ARCHIVE CATCH
   ========================================================= */

function initializeGame() {
    game.canvas =
        document.getElementById(
            "game-canvas"
        );

    if (!game.canvas) {
        return;
    }

    game.context =
        game.canvas.getContext(
            "2d"
        );

    game.context.imageSmoothingEnabled =
        false;

    document
        .getElementById(
            "game-start"
        )
        ?.addEventListener(
            "click",
            startGame
        );

    document
        .getElementById(
            "game-pause"
        )
        ?.addEventListener(
            "click",
            toggleGamePause
        );

    document
        .getElementById(
            "game-restart"
        )
        ?.addEventListener(
            "click",
            startGame
        );

    initializeTouchGameControls();
    resetGameState();
    drawGamePreview();
    updateGameInterface();
}


function initializeTouchGameControls() {
    document
        .querySelectorAll(
            "[data-game-control]"
        )
        .forEach((button) => {
            const control =
                button.dataset.gameControl;

            button.addEventListener(
                "pointerdown",
                (event) => {
                    event.preventDefault();

                    if (
                        control ===
                        "left"
                    ) {
                        game.keys.left =
                            true;
                    }

                    if (
                        control ===
                        "right"
                    ) {
                        game.keys.right =
                            true;
                    }
                }
            );

            const release =
                () => {
                    if (
                        control ===
                        "left"
                    ) {
                        game.keys.left =
                            false;
                    }

                    if (
                        control ===
                        "right"
                    ) {
                        game.keys.right =
                            false;
                    }
                };

            button.addEventListener(
                "pointerup",
                release
            );

            button.addEventListener(
                "pointercancel",
                release
            );

            button.addEventListener(
                "pointerleave",
                release
            );
        });
}


function resetGameState() {
    game.score = 0;
    game.lives = 3;
    game.spawnTimer = 0.5;
    game.objects = [];

    game.player.x =
        game.canvas
            ? game.canvas.width /
                2 -
                game.player.width /
                2
            : 275;

    game.player.y =
        282;

    game.keys.left =
        false;

    game.keys.right =
        false;
}


function startGame() {
    if (
        !game.canvas ||
        !game.context
    ) {
        return;
    }

    stopGame();
    resetGameState();

    game.running =
        true;

    game.paused =
        false;

    game.lastTime =
        performance.now();

    hideGameOverlay();

    updateGameStatus(
        "RUNNING"
    );

    updatePauseButton();
    updateGameInterface();

    game.animationFrame =
        requestAnimationFrame(
            gameLoop
        );
}


function stopGame() {
    game.running =
        false;

    game.paused =
        false;

    game.keys.left =
        false;

    game.keys.right =
        false;

    if (game.animationFrame) {
        cancelAnimationFrame(
            game.animationFrame
        );

        game.animationFrame =
            null;
    }

    updatePauseButton();
}


function toggleGamePause() {
    if (!game.running) {
        return;
    }

    game.paused =
        !game.paused;

    updateGameStatus(
        game.paused
            ? "PAUSED"
            : "RUNNING"
    );

    updatePauseButton();
}


function updatePauseButton() {
    const button =
        document.getElementById(
            "game-pause"
        );

    if (button) {
        button.textContent =
            game.paused
                ? "Resume"
                : "Pause";
    }
}


function gameLoop(now) {
    if (!game.running) {
        return;
    }

    const delta =
        Math.min(
            (
                now -
                game.lastTime
            ) /
            1000,
            0.035
        );

    game.lastTime =
        now;

    if (!game.paused) {
        updateGame(
            delta
        );
    }

    drawGame();

    if (game.paused) {
        drawPausedOverlay();
    }

    if (game.running) {
        game.animationFrame =
            requestAnimationFrame(
                gameLoop
            );
    }
}


function updateGame(delta) {
    if (game.keys.left) {
        game.player.x -=
            game.player.speed *
            delta;
    }

    if (game.keys.right) {
        game.player.x +=
            game.player.speed *
            delta;
    }

    game.player.x =
        clamp(
            game.player.x,
            0,
            game.canvas.width -
                game.player.width
        );

    game.spawnTimer -=
        delta;

    if (
        game.spawnTimer <=
        0
    ) {
        const harmful =
            Math.random() <
            0.23;

        game.objects.push({
            x:
                18 +
                Math.random() *
                (
                    game.canvas.width -
                    45
                ),

            y:
                -28,

            width:
                harmful
                    ? 22
                    : 18,

            height:
                harmful
                    ? 22
                    : 18,

            speed:
                145 +
                Math.random() *
                110,

            harmful
        });

        game.spawnTimer =
            0.38 +
            Math.random() *
            0.45;
    }

    for (
        let index =
            game.objects.length -
            1;
        index >= 0;
        index -= 1
    ) {
        const object =
            game.objects[
                index
            ];

        object.y +=
            object.speed *
            delta;

        if (
            rectanglesOverlap(
                game.player,
                object
            )
        ) {
            game.objects.splice(
                index,
                1
            );

            if (
                object.harmful
            ) {
                game.lives -=
                    1;

                updateGameStatus(
                    "DARK BLOCK CAUGHT"
                );

                if (
                    game.lives <=
                    0
                ) {
                    finishGame();
                    return;
                }
            } else {
                game.score +=
                    10;
            }
        } else if (
            object.y >
            game.canvas.height +
                30
        ) {
            game.objects.splice(
                index,
                1
            );
        }
    }

    game.score +=
        delta;

    updateGameInterface();
}


function drawGamePreview() {
    if (
        !game.canvas ||
        !game.context
    ) {
        return;
    }

    resetGameState();

    game.objects = [
        {
            x: 120,
            y: 90,
            width: 18,
            height: 18,
            harmful: false
        },

        {
            x: 420,
            y: 140,
            width: 22,
            height: 22,
            harmful: true
        },

        {
            x: 310,
            y: 55,
            width: 18,
            height: 18,
            harmful: false
        }
    ];

    drawGame();
}


function drawGame() {
    const context =
        game.context;

    const canvas =
        game.canvas;

    if (
        !context ||
        !canvas
    ) {
        return;
    }

    context.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    context.fillStyle =
        "#152019";

    context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    drawGameGrid();

    game.objects.forEach(
        (object) => {
            if (
                object.harmful
            ) {
                drawDarkBlock(
                    object
                );
            } else {
                drawFivePointStar(
                    object
                );
            }
        }
    );

    drawPlayer();
}


function drawGameGrid() {
    const context =
        game.context;

    const canvas =
        game.canvas;

    context.strokeStyle =
        "#26392d";

    context.lineWidth =
        1;

    for (
        let x = 0;
        x <= canvas.width;
        x += 32
    ) {
        context.beginPath();

        context.moveTo(
            x,
            0
        );

        context.lineTo(
            x,
            canvas.height
        );

        context.stroke();
    }

    for (
        let y = 0;
        y <= canvas.height;
        y += 32
    ) {
        context.beginPath();

        context.moveTo(
            0,
            y
        );

        context.lineTo(
            canvas.width,
            y
        );

        context.stroke();
    }
}


function drawPlayer() {
    const context =
        game.context;

    context.fillStyle =
        "#ead0d8";

    context.fillRect(
        game.player.x,
        game.player.y,
        game.player.width,
        game.player.height
    );

    context.fillStyle =
        "#65384b";

    context.fillRect(
        game.player.x + 9,
        game.player.y + 5,
        game.player.width - 18,
        6
    );

    context.strokeStyle =
        "#28251f";

    context.strokeRect(
        game.player.x,
        game.player.y,
        game.player.width,
        game.player.height
    );
}


function drawFivePointStar(object) {
    const context =
        game.context;

    const cx =
        object.x +
        object.width / 2;

    const cy =
        object.y +
        object.height / 2;

    const outer =
        Math.max(
            object.width,
            object.height
        ) * 0.58;

    const inner =
        outer * 0.45;

    context.beginPath();

    for (
        let i = 0;
        i < 10;
        i += 1
    ) {
        const radius =
            i % 2 === 0
                ? outer
                : inner;

        const angle =
            -Math.PI / 2 +
            i * Math.PI / 5;

        const x =
            cx +
            Math.cos(angle) *
            radius;

        const y =
            cy +
            Math.sin(angle) *
            radius;

        if (i === 0) {
            context.moveTo(
                x,
                y
            );
        } else {
            context.lineTo(
                x,
                y
            );
        }
    }

    context.closePath();

    context.fillStyle =
        "#c794a6";

    context.fill();

    context.strokeStyle =
        "#ead0d8";

    context.lineWidth =
        2;

    context.stroke();
}


function drawDarkBlock(object) {
    const context =
        game.context;

    context.fillStyle =
        "#181418";

    context.fillRect(
        object.x,
        object.y,
        object.width,
        object.height
    );

    context.strokeStyle =
        "#c794a6";

    context.strokeRect(
        object.x,
        object.y,
        object.width,
        object.height
    );
}


function drawPausedOverlay() {
    const context =
        game.context;

    context.fillStyle =
        "rgba(10, 15, 12, 0.72)";

    context.fillRect(
        0,
        0,
        game.canvas.width,
        game.canvas.height
    );

    context.fillStyle =
        "#dceccc";

    context.textAlign =
        "center";

    context.font =
        "bold 29px monospace";

    context.fillText(
        "GAME PAUSED",
        game.canvas.width / 2,
        game.canvas.height / 2
    );

    context.textAlign =
        "left";
}


function finishGame() {
    game.running =
        false;

    game.paused =
        false;

    if (game.animationFrame) {
        cancelAnimationFrame(
            game.animationFrame
        );

        game.animationFrame =
            null;
    }

    saveHighScore();
    updateGameInterface();

    updateGameStatus(
        "GAME OVER"
    );

    showGameOverlay(
        "Game Over",
        `Final score: ${Math.floor(
            game.score
        )}`,
        "Play Again"
    );

    updatePauseButton();
}


function rectanglesOverlap(a, b) {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    );
}


function updateGameInterface() {
    setText(
        "game-score",
        formatScore(
            game.score
        )
    );

    setText(
        "game-lives",
        String(
            game.lives
        )
    );

    setText(
        "game-high-score",
        formatScore(
            getHighScore()
        )
    );
}


function updateGameStatus(message) {
    setText(
        "game-status",
        message
    );
}


function showGameOverlay(
    title,
    text,
    buttonText
) {
    setText(
        "game-overlay-title",
        title
    );

    setText(
        "game-overlay-text",
        text
    );

    const button =
        document.getElementById(
            "game-start"
        );

    if (button) {
        button.textContent =
            buttonText;
    }

    document
        .getElementById(
            "game-overlay"
        )
        ?.classList.remove(
            HIDDEN_CLASS
        );
}


function hideGameOverlay() {
    document
        .getElementById(
            "game-overlay"
        )
        ?.classList.add(
            HIDDEN_CLASS
        );
}


function formatScore(score) {
    return String(
        Math.floor(
            score
        )
    ).padStart(
        4,
        "0"
    );
}


function getHighScore() {
    try {
        return (
            Number.parseInt(
                localStorage.getItem(
                    "summaiya-archive-catch-high-score"
                ) || "0",
                10
            ) || 0
        );
    } catch {
        return 0;
    }
}


function saveHighScore() {
    const score =
        Math.floor(
            game.score
        );

    if (
        score <=
        getHighScore()
    ) {
        return;
    }

    try {
        localStorage.setItem(
            "summaiya-archive-catch-high-score",
            String(score)
        );
    } catch {
        /* Local storage optional. */
    }
}


/* =========================================================
   MORE MENU
   ========================================================= */

function toggleMoreMenu(forceOpen) {
    const menu =
        document.getElementById(
            "more-menu"
        );

    const button =
        document.getElementById(
            "more-button"
        );

    if (
        !menu ||
        !button
    ) {
        return;
    }

    const open =
        typeof forceOpen ===
            "boolean"
            ? forceOpen
            : menu.classList.contains(
                HIDDEN_CLASS
            );

    menu.classList.toggle(
        HIDDEN_CLASS,
        !open
    );

    button.setAttribute(
        "aria-expanded",
        open
            ? "true"
            : "false"
    );
}


function closeMoreMenu() {
    toggleMoreMenu(false);
}


/* =========================================================
   PROJECTS FOCUS MODE
   ========================================================= */

function enterProjectsFocus() {
    document.body.classList.add(
        "projects-focus-mode"
    );
}


function exitProjectsFocus() {
    document.body.classList.remove(
        "projects-focus-mode"
    );

    const projects =
        document.getElementById(
            "projects"
        );

    if (!projects) {
        return;
    }

    projects.style.left = "";
    projects.style.right = "";
    projects.style.top = "";
    projects.style.bottom = "";
    projects.style.width = "";
    projects.style.height = "";
    projects.style.maxWidth = "";
    projects.style.maxHeight = "";
    projects.style.transform = "";

    requestAnimationFrame(() =>
        keepWindowInsideViewport(
            projects
        )
    );
}


/* =========================================================
   REVIEWS + ADMIN API
   ========================================================= */

const WINDOW_ENTRY_TARGETS = {
    about: "About Me",
    skills: "Skills",
    education: "Education",
    awards: "Awards",
    links: "Links"
};


async function portfolioContentRequest(
    payload,
    options = {}
) {
    const headers = {
        "Content-Type":
            "application/json"
    };

    if (
        options.admin &&
        portfolioAdminToken
    ) {
        headers.Authorization =
            `Bearer ${portfolioAdminToken}`;
    }

    const response =
        await fetch(
            PORTFOLIO_CONTENT_ENDPOINT,
            {
                method:
                    payload
                        ? "POST"
                        : "GET",

                headers,

                body:
                    payload
                        ? JSON.stringify(
                            payload
                        )
                        : undefined
            }
        );

    let data = {};

    try {
        data =
            await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        const error =
            new Error(
                data.error ||
                "Request failed."
            );

        error.status =
            response.status;

        throw error;
    }

    return data;
}


function setRecommendationView(
    mode = "write"
) {
    const view =
        mode === "browse"
            ? "browse"
            : "write";

    const writePanel =
        document.getElementById(
            "recommendation-write-panel"
        );

    const browsePanel =
        document.getElementById(
            "recommendation-browse-panel"
        );

    writePanel?.classList.toggle(
        HIDDEN_CLASS,
        view !== "write"
    );

    browsePanel?.classList.toggle(
        HIDDEN_CLASS,
        view !== "browse"
    );

    document
        .querySelectorAll(
            "[data-review-view]"
        )
        .forEach((button) => {
            const active =
                button.dataset.reviewView ===
                view;

            button.classList.toggle(
                "is-active",
                active
            );

            button.setAttribute(
                "aria-selected",
                active
                    ? "true"
                    : "false"
            );
        });

    const scrollArea =
        document.querySelector(
            "#recommendations .recommendation-scroll"
        );

    if (scrollArea) {
        scrollArea.scrollTop =
            0;
    }
}


function openRecommendationsWindow(
    mode = "write"
) {
    openWindow(
        "recommendations"
    );

    setRecommendationView(
        mode
    );

    loadPublicPortfolioContent();
}


function openReviewsWindow() {
    openRecommendationsWindow(
        "write"
    );
}


function openAdminLogin() {
    closeMoreMenu();

    if (portfolioAdminToken) {
        openWindow(
            "admin-panel"
        );

        loadAdminDashboard();

        return;
    }

    openWindow(
        "admin-login"
    );

    setTimeout(
        () =>
            document
                .getElementById(
                    "admin-password"
                )
                ?.focus(),
        50
    );
}


async function loadPublicPortfolioContent() {
    try {
        const data =
            await portfolioContentRequest(
                null
            );

        publicPortfolioContent = {
            recommendations:
                Array.isArray(
                    data.recommendations
                )
                    ? data.recommendations
                    : [],

            projects:
                Array.isArray(
                    data.projects
                )
                    ? data.projects
                    : [],

            experiences:
                Array.isArray(
                    data.experiences
                )
                    ? data.experiences
                    : [],

            windowEntries:
                Array.isArray(
                    data.windowEntries
                )
                    ? data.windowEntries
                    : [],

            resume:
                data.resume ||
                null
        };

        renderApprovedRecommendations(
            publicPortfolioContent
                .recommendations
        );

        renderDynamicProjects(
            publicPortfolioContent
                .projects
        );

        renderDynamicExperiences(
            publicPortfolioContent
                .experiences
        );

        renderDynamicWindowEntries(
            publicPortfolioContent
                .windowEntries
        );

        applyResumeOverride(
            publicPortfolioContent
                .resume
        );

        applyAllProjectFilters();
    } catch {
        const container =
            document.getElementById(
                "approved-recommendations"
            );

        if (!container) {
            return;
        }

        container.replaceChildren();

        const message =
            document.createElement(
                "p"
            );

        message.className =
            "empty-state";

        message.textContent =
            "Reviews are temporarily unavailable.";

        container.appendChild(
            message
        );
    }
}


function renderApprovedRecommendations(
    items
) {
    const container =
        document.getElementById(
            "approved-recommendations"
        );

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!items.length) {
        const empty =
            document.createElement(
                "p"
            );

        empty.className =
            "empty-state";

        empty.textContent =
            "No approved reviews yet.";

        container.appendChild(
            empty
        );

        return;
    }

    items
        .slice()
        .sort(
            (a, b) =>
                String(
                    b.approvedAt ||
                    b.createdAt ||
                    ""
                ).localeCompare(
                    String(
                        a.approvedAt ||
                        a.createdAt ||
                        ""
                    )
                )
        )
        .forEach((item) => {
            const article =
                document.createElement(
                    "article"
                );

            article.className =
                "recommendation-item";

            const quote =
                document.createElement(
                    "blockquote"
                );

            quote.textContent =
                `“${item.text}”`;

            const footer =
                document.createElement(
                    "footer"
                );

            const name =
                document.createElement(
                    "strong"
                );

            name.textContent =
                item.name ||
                "Anonymous";

            footer.appendChild(
                name
            );

            if (item.role) {
                const role =
                    document.createElement(
                        "span"
                    );

                role.textContent =
                    item.role;

                footer.appendChild(
                    role
                );
            }

            article.append(
                quote,
                footer
            );

            container.appendChild(
                article
            );
        });
}


async function submitRecommendation(
    event
) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const status =
        document.getElementById(
            "recommendation-status"
        );

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    if (button) {
        button.disabled =
            true;

        button.textContent =
            "Submitting...";
    }

    if (status) {
        status.textContent =
            "";
    }

    try {
        await portfolioContentRequest({
            action:
                "submitRecommendation",

            name:
                form.elements
                    .name
                    .value
                    .trim(),

            role:
                form.elements
                    .role
                    .value
                    .trim(),

            text:
                form.elements
                    .text
                    .value
                    .trim(),

            website:
                form.elements
                    .website
                    ?.value ||
                ""
        });

        form.reset();

        if (status) {
            status.textContent =
                "Thanks! Your review was submitted for approval.";
        }
    } catch (error) {
        if (status) {
            status.textContent =
                error.message ||
                "Could not submit your review.";
        }
    } finally {
        if (button) {
            button.disabled =
                false;

            button.textContent =
                "Submit for Approval";
        }
    }
}


async function submitAdminLogin(
    event
) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const status =
        document.getElementById(
            "admin-login-status"
        );

    const button =
        form.querySelector(
            'button[type="submit"]'
        );

    if (button) {
        button.disabled =
            true;
    }

    if (status) {
        status.textContent =
            "Checking...";
    }

    try {
        const data =
            await portfolioContentRequest({
                action:
                    "login",

                password:
                    document
                        .getElementById(
                            "admin-password"
                        )
                        ?.value ||
                    ""
            });

        portfolioAdminToken =
            data.token ||
            "";

        if (!portfolioAdminToken) {
            throw new Error(
                "Login failed."
            );
        }

        sessionStorage.setItem(
            "portfolioAdminToken",
            portfolioAdminToken
        );

        form.reset();

        if (status) {
            status.textContent =
                "";
        }

        closeWindow(
            "admin-login"
        );

        openWindow(
            "admin-panel"
        );

        await loadAdminDashboard();
    } catch (error) {
        if (status) {
            status.textContent =
                error.status === 401
                    ? "Incorrect password."
                    : error.message ||
                      "Could not sign in.";
        }
    } finally {
        if (button) {
            button.disabled =
                false;
        }
    }
}


async function adminAction(
    action,
    data = {}
) {
    try {
        return await portfolioContentRequest(
            {
                action,
                ...data
            },
            {
                admin: true
            }
        );
    } catch (error) {
        if (error.status === 401) {
            portfolioAdminToken =
                "";

            sessionStorage.removeItem(
                "portfolioAdminToken"
            );

            closeWindow(
                "admin-panel"
            );

            openWindow(
                "admin-login"
            );
        }

        throw error;
    }
}


async function loadAdminDashboard() {
    const status =
        document.getElementById(
            "admin-global-status"
        );

    if (status) {
        status.textContent =
            "Loading...";
    }

    try {
        const data =
            await adminAction(
                "adminList"
            );

        renderAdminRecommendations(
            data.recommendations ||
            []
        );

        renderAdminManagedItems(
            "admin-project-list",
            data.projects ||
            [],
            "project"
        );

        renderAdminManagedItems(
            "admin-experience-list",
            data.experiences ||
            [],
            "experience"
        );

        renderAdminManagedItems(
            "admin-window-entry-list",
            data.windowEntries ||
            [],
            "windowEntry"
        );

        renderAdminResumeStatus(
            data.resume ||
            null
        );

        if (status) {
            status.textContent =
                "";
        }
    } catch (error) {
        if (status) {
            status.textContent =
                error.message ||
                "Could not load admin data.";
        }
    }
}


function renderAdminRecommendations(
    items
) {
    const container =
        document.getElementById(
            "admin-recommendation-list"
        );

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!items.length) {
        const empty =
            document.createElement(
                "p"
            );

        empty.className =
            "empty-state";

        empty.textContent =
            "No reviews waiting.";

        container.appendChild(
            empty
        );

        return;
    }

    items
        .slice()
        .sort(
            (a, b) =>
                String(
                    b.createdAt ||
                    ""
                ).localeCompare(
                    String(
                        a.createdAt ||
                        ""
                    )
                )
        )
        .forEach((item) => {
            const article =
                document.createElement(
                    "article"
                );

            article.className =
                "admin-approval-item";

            const heading =
                document.createElement(
                    "strong"
                );

            heading.textContent =
                `${item.name}${
                    item.role
                        ? ` · ${item.role}`
                        : ""
                }`;

            const text =
                document.createElement(
                    "p"
                );

            text.textContent =
                item.text;

            const meta =
                document.createElement(
                    "small"
                );

            meta.textContent =
                `Status: ${
                    item.status ||
                    "pending"
                }`;

            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "admin-item-actions";

            if (
                item.status !==
                "approved"
            ) {
                const approve =
                    document.createElement(
                        "button"
                    );

                approve.type =
                    "button";

                approve.className =
                    "retro-button small-button";

                approve.textContent =
                    "Approve";

                approve.addEventListener(
                    "click",
                    () =>
                        changeRecommendationStatus(
                            item.id,
                            "approved"
                        )
                );

                actions.appendChild(
                    approve
                );
            } else {
                const hide =
                    document.createElement(
                        "button"
                    );

                hide.type =
                    "button";

                hide.className =
                    "retro-button small-button";

                hide.textContent =
                    "Unpublish";

                hide.addEventListener(
                    "click",
                    () =>
                        changeRecommendationStatus(
                            item.id,
                            "pending"
                        )
                );

                actions.appendChild(
                    hide
                );
            }

            const remove =
                document.createElement(
                    "button"
                );

            remove.type =
                "button";

            remove.className =
                "retro-button small-button";

            remove.textContent =
                "Delete";

            remove.addEventListener(
                "click",
                () =>
                    deleteAdminItem(
                        "recommendation",
                        item.id
                    )
            );

            actions.appendChild(
                remove
            );

            article.append(
                heading,
                text,
                meta,
                actions
            );

            container.appendChild(
                article
            );
        });
}


function renderAdminManagedItems(
    containerId,
    items,
    type
) {
    const container =
        document.getElementById(
            containerId
        );

    if (!container) {
        return;
    }

    container.replaceChildren();

    if (!items.length) {
        const empty =
            document.createElement(
                "p"
            );

        empty.className =
            "empty-state";

        empty.textContent =
            type === "project"
                ? "No admin-added projects."
                : type === "experience"
                    ? "No admin-added experience."
                    : "No extra window content.";

        container.appendChild(
            empty
        );

        return;
    }

    items.forEach((item) => {
        const row =
            document.createElement(
                "div"
            );

        row.className =
            "admin-managed-item";

        const wrap =
            document.createElement(
                "div"
            );

        const title =
            document.createElement(
                "strong"
            );

        title.textContent =
            type === "project"
                ? item.title
                : type === "experience"
                    ? `${item.role} · ${item.organization}`
                    : `${
                        WINDOW_ENTRY_TARGETS[
                            item.windowId
                        ] ||
                        item.windowId
                    } · ${item.title}`;

        wrap.appendChild(
            title
        );

        const actions =
            document.createElement(
                "div"
            );

        actions.className =
            "admin-item-actions";

        const remove =
            document.createElement(
                "button"
            );

        remove.type =
            "button";

        remove.className =
            "retro-button small-button";

        remove.textContent =
            "Delete";

        remove.addEventListener(
            "click",
            () =>
                deleteAdminItem(
                    type,
                    item.id
                )
        );

        actions.appendChild(
            remove
        );

        row.append(
            wrap,
            actions
        );

        container.appendChild(
            row
        );
    });
}


function renderAdminResumeStatus(
    resume
) {
    const container =
        document.getElementById(
            "admin-resume-status"
        );

    if (!container) {
        return;
    }

    container.replaceChildren();

    const box =
        document.createElement(
            "div"
        );

    box.className =
        "admin-resume-meta";

    if (!resume) {
        const text =
            document.createElement(
                "p"
            );

        text.className =
            "empty-state";

        text.textContent =
            "Using the bundled CV. Upload a PDF above to replace it site-wide.";

        box.appendChild(
            text
        );
    } else {
        const name =
            document.createElement(
                "strong"
            );

        name.textContent =
            resume.name ||
            "Uploaded resume.pdf";

        const date =
            document.createElement(
                "small"
            );

        date.textContent =
            resume.updatedAt
                ? `Updated ${new Date(
                    resume.updatedAt
                ).toLocaleString()}`
                : "Uploaded resume active";

        box.append(
            name,
            date
        );
    }

    container.appendChild(
        box
    );
}


async function changeRecommendationStatus(
    id,
    status
) {
    try {
        await adminAction(
            "setRecommendationStatus",
            {
                id,
                status
            }
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not update review."
        );
    }
}


async function deleteAdminItem(
    type,
    id
) {
    if (
        !confirm(
            "Delete this item?"
        )
    ) {
        return;
    }

    const actions = {
        recommendation:
            "deleteRecommendation",

        project:
            "deleteProject",

        experience:
            "deleteExperience",

        windowEntry:
            "deleteWindowEntry"
    };

    const action =
        actions[type];

    if (!action) {
        return;
    }

    try {
        await adminAction(
            action,
            {
                id
            }
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not delete item."
        );
    }
}


async function submitAdminProject(
    event
) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const data =
        new FormData(
            form
        );

    try {
        setText(
            "admin-global-status",
            "Adding project..."
        );

        await adminAction(
            "addProject",
            {
                title:
                    data.get(
                        "title"
                    ),

                category:
                    data.get(
                        "category"
                    ),

                summary:
                    data.get(
                        "summary"
                    ),

                tools:
                    data.get(
                        "tools"
                    ),

                demoUrl:
                    data.get(
                        "demoUrl"
                    )
            }
        );

        form.reset();

        setText(
            "admin-global-status",
            "Project added."
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not add project."
        );
    }
}


async function submitAdminExperience(
    event
) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const data =
        new FormData(
            form
        );

    try {
        setText(
            "admin-global-status",
            "Adding experience..."
        );

        await adminAction(
            "addExperience",
            {
                role:
                    data.get(
                        "role"
                    ),

                organization:
                    data.get(
                        "organization"
                    ),

                dates:
                    data.get(
                        "dates"
                    ),

                description:
                    data.get(
                        "description"
                    )
            }
        );

        form.reset();

        setText(
            "admin-global-status",
            "Experience added."
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not add experience."
        );
    }
}


async function submitAdminWindowEntry(
    event
) {
    event.preventDefault();

    const form =
        event.currentTarget;

    const data =
        new FormData(
            form
        );

    try {
        setText(
            "admin-global-status",
            "Adding window content..."
        );

        await adminAction(
            "addWindowEntry",
            {
                windowId:
                    data.get(
                        "windowId"
                    ),

                title:
                    data.get(
                        "title"
                    ),

                subtitle:
                    data.get(
                        "subtitle"
                    ),

                description:
                    data.get(
                        "description"
                    ),

                tags:
                    data.get(
                        "tags"
                    ),

                linkUrl:
                    data.get(
                        "linkUrl"
                    )
            }
        );

        form.reset();

        setText(
            "admin-global-status",
            "Window content added."
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not add window content."
        );
    }
}


function readFileAsBase64(file) {
    return new Promise(
        (resolve, reject) => {
            const reader =
                new FileReader();

            reader.onload =
                () => {
                    const result =
                        String(
                            reader.result ||
                            ""
                        );

                    resolve(
                        result.includes(",")
                            ? result.split(",")[1]
                            : result
                    );
                };

            reader.onerror =
                () =>
                    reject(
                        new Error(
                            "Could not read the selected file."
                        )
                    );

            reader.readAsDataURL(
                file
            );
        }
    );
}


async function submitAdminResume(
    event
) {
    event.preventDefault();

    const input =
        document.getElementById(
            "admin-resume-file"
        );

    const file =
        input?.files?.[0];

    if (!file) {
        setText(
            "admin-global-status",
            "Choose a PDF first."
        );

        return;
    }

    if (
        file.type &&
        file.type !==
            "application/pdf"
    ) {
        setText(
            "admin-global-status",
            "Resume must be a PDF."
        );

        return;
    }

    if (
        file.size >
        3 * 1024 * 1024
    ) {
        setText(
            "admin-global-status",
            "Resume PDF must be under 3 MB."
        );

        return;
    }

    try {
        setText(
            "admin-global-status",
            "Uploading resume..."
        );

        const base64 =
            await readFileAsBase64(
                file
            );

        await adminAction(
            "uploadResume",
            {
                name:
                    file.name,

                mime:
                    "application/pdf",

                base64
            }
        );

        event.currentTarget.reset();

        setText(
            "admin-global-status",
            "Resume updated site-wide."
        );

        await Promise.all([
            loadAdminDashboard(),
            loadPublicPortfolioContent()
        ]);
    } catch (error) {
        setText(
            "admin-global-status",
            error.message ||
            "Could not upload resume."
        );
    }
}


/* =========================================================
   ADMIN-ADDED CONTENT RENDERING
   ========================================================= */

function getDynamicProjectGroup() {
    const grid =
        document.querySelector(
            "#projects .project-grid"
        );

    if (!grid) {
        return null;
    }

    let group =
        document.getElementById(
            "admin-added-projects-group"
        );

    if (group) {
        return group;
    }

    group =
        document.createElement(
            "section"
        );

    group.id =
        "admin-added-projects-group";

    group.className =
        "project-category-group";

    const divider =
        document.createElement(
            "div"
        );

    divider.className =
        "project-category-divider";

    const title =
        document.createElement(
            "span"
        );

    title.textContent =
        "Recently Added";

    const count =
        document.createElement(
            "small"
        );

    count.id =
        "admin-added-project-count";

    divider.append(
        title,
        count
    );

    group.appendChild(
        divider
    );

    grid.appendChild(
        group
    );

    return group;
}


function renderDynamicProjects(
    items
) {
    const group =
        getDynamicProjectGroup();

    if (!group) {
        return;
    }

    group
        .querySelectorAll(
            ".admin-added-project"
        )
        .forEach(
            (element) =>
                element.remove()
        );

    const staticCount =
        document.querySelectorAll(
            "#projects .project-card:not(.admin-added-project)"
        ).length;

    items.forEach(
        (item, index) => {
            const card =
                document.createElement(
                    "article"
                );

            card.className =
                `project-card admin-added-project${
                    item.demoUrl
                        ? " has-linkedin-demo"
                        : ""
                }`;

            card.dataset.projectCategory =
                item.category ||
                "software";

            const content =
                document.createElement(
                    "div"
                );

            content.className =
                "project-card-content";

            const header =
                document.createElement(
                    "div"
                );

            header.className =
                "project-card-header";

            const number =
                document.createElement(
                    "div"
                );

            number.className =
                "project-card-number";

            number.textContent =
                String(
                    staticCount +
                    index +
                    1
                ).padStart(
                    2,
                    "0"
                );

            const headingWrap =
                document.createElement(
                    "div"
                );

            const heading =
                document.createElement(
                    "h2"
                );

            heading.textContent =
                item.title;

            headingWrap.appendChild(
                heading
            );

            header.append(
                number,
                headingWrap
            );

            const summary =
                document.createElement(
                    "p"
                );

            summary.className =
                "project-summary";

            summary.textContent =
                item.summary;

            const tools =
                document.createElement(
                    "div"
                );

            tools.className =
                "tool-list";

            (
                item.tools ||
                []
            ).forEach((tool) => {
                const tag =
                    document.createElement(
                        "span"
                    );

                tag.textContent =
                    tool;

                tools.appendChild(
                    tag
                );
            });

            content.append(
                header,
                summary,
                tools
            );

            if (item.demoUrl) {
                const demo =
                    document.createElement(
                        "a"
                    );

                demo.className =
                    "project-demo-link";

                demo.href =
                    item.demoUrl;

                demo.target =
                    "_blank";

                demo.rel =
                    "noopener noreferrer";

                demo.textContent =
                    "View Demo ↗";

                content.appendChild(
                    demo
                );
            }

            card.dataset.projectSearch =
                [
                    item.title,
                    item.summary,
                    ...(
                        item.tools ||
                        []
                    )
                ]
                    .join(" ")
                    .toLowerCase();

            card.appendChild(
                content
            );

            group.appendChild(
                card
            );
        }
    );

    const count =
        document.getElementById(
            "admin-added-project-count"
        );

    if (count) {
        count.textContent =
            `${items.length} ${
                items.length === 1
                    ? "PROJECT"
                    : "PROJECTS"
            }`;
    }

    group.hidden =
        items.length ===
        0;
}


function renderDynamicExperiences(
    items
) {
    const timeline =
        document.querySelector(
            "#experience .timeline"
        );

    if (!timeline) {
        return;
    }

    timeline
        .querySelectorAll(
            ".admin-added-experience"
        )
        .forEach(
            (element) =>
                element.remove()
        );

    [
        ...items
    ]
        .reverse()
        .forEach((item) => {
            const article =
                document.createElement(
                    "article"
                );

            article.className =
                "timeline-entry admin-added-experience";

            const marker =
                document.createElement(
                    "span"
                );

            marker.className =
                "timeline-marker";

            const dates =
                document.createElement(
                    "p"
                );

            dates.className =
                "record-number";

            dates.textContent =
                item.dates;

            const heading =
                document.createElement(
                    "h3"
                );

            heading.textContent =
                `${item.role} · ${item.organization}`;

            const description =
                document.createElement(
                    "p"
                );

            description.textContent =
                item.description;

            article.append(
                marker,
                dates,
                heading,
                description
            );

            timeline.prepend(
                article
            );
        });
}


function renderDynamicWindowEntries(
    items
) {
    Object.keys(
        WINDOW_ENTRY_TARGETS
    ).forEach((windowId) => {
        document
            .getElementById(
                `admin-window-additions-${windowId}`
            )
            ?.remove();
    });

    const grouped = {};

    items.forEach((item) => {
        if (
            !WINDOW_ENTRY_TARGETS[
                item.windowId
            ]
        ) {
            return;
        }

        (
            grouped[item.windowId] ||=
            []
        ).push(item);
    });

    Object.entries(
        grouped
    ).forEach(
        ([windowId, entries]) => {
            const scroll =
                document.querySelector(
                    `#${windowId} .window-scroll`
                );

            if (!scroll) {
                return;
            }

            const section =
                document.createElement(
                    "section"
                );

            section.id =
                `admin-window-additions-${windowId}`;

            section.className =
                "admin-dynamic-section";

            const heading =
                document.createElement(
                    "h3"
                );

            heading.textContent =
                "Latest Additions";

            section.appendChild(
                heading
            );

            entries.forEach((item) => {
                const card =
                    document.createElement(
                        "article"
                    );

                card.className =
                    "admin-window-entry-card";

                const title =
                    document.createElement(
                        "h4"
                    );

                title.textContent =
                    item.title;

                card.appendChild(
                    title
                );

                if (item.subtitle) {
                    const subtitle =
                        document.createElement(
                            "p"
                        );

                    subtitle.className =
                        "entry-subtitle";

                    subtitle.textContent =
                        item.subtitle;

                    card.appendChild(
                        subtitle
                    );
                }

                const description =
                    document.createElement(
                        "p"
                    );

                description.textContent =
                    item.description;

                card.appendChild(
                    description
                );

                if (
                    Array.isArray(
                        item.tags
                    ) &&
                    item.tags.length
                ) {
                    const tags =
                        document.createElement(
                            "div"
                        );

                    tags.className =
                        "tool-list";

                    item.tags.forEach(
                        (tag) => {
                            const span =
                                document.createElement(
                                    "span"
                                );

                            span.textContent =
                                tag;

                            tags.appendChild(
                                span
                            );
                        }
                    );

                    card.appendChild(
                        tags
                    );
                }

                if (item.linkUrl) {
                    const link =
                        document.createElement(
                            "a"
                        );

                    link.className =
                        "entry-link";

                    link.href =
                        item.linkUrl;

                    link.target =
                        "_blank";

                    link.rel =
                        "noopener noreferrer";

                    link.textContent =
                        "Open Link ↗";

                    card.appendChild(
                        link
                    );
                }

                section.appendChild(
                    card
                );
            });

            scroll.appendChild(
                section
            );
        }
    );
}


function applyResumeOverride(resume) {
    if (!resume) {
        return;
    }

    const resumeUrl =
        `${PORTFOLIO_CONTENT_ENDPOINT}?asset=resume&v=${encodeURIComponent(
            resume.updatedAt ||
            "latest"
        )}`;

    document
        .querySelectorAll(
            'a[href*="Summaiya_Shoaib_CV.pdf"], a[data-resume-link]'
        )
        .forEach((link) => {
            link.href =
                resumeUrl;

            link.dataset.resumeLink =
                "dynamic";
        });
}


/* =========================================================
   PROJECT FILTER COMPATIBILITY
   ========================================================= */

function applyAllProjectFilters() {
    const activeFilter =
        document.querySelector(
            "#projects .project-filter.is-active"
        ) ||
        document.querySelector(
            "#projects .project-filter.active"
        ) ||
        document.querySelector(
            "#projects .project-filter[aria-pressed='true']"
        );

    const filter =
        activeFilter
            ?.dataset
            .projectFilter ||
        "all";

    const query =
        (
            document
                .getElementById(
                    "project-search-input"
                )
                ?.value ||
            ""
        )
            .trim()
            .toLowerCase();

    const cards =
        [
            ...document.querySelectorAll(
                "#projects .project-card"
            )
        ];

    let visibleCount =
        0;

    cards.forEach((card) => {
        if (
            !card.dataset
                .projectSearch
        ) {
            card.dataset.projectSearch =
                card.textContent
                    .toLowerCase();
        }

        const category =
            card.dataset
                .projectCategory ||
            "software";

        const categoryMatches =
            filter ===
                "all" ||
            category ===
                filter;

        const searchMatches =
            !query ||
            card.dataset
                .projectSearch
                .includes(
                    query
                );

        const visible =
            categoryMatches &&
            searchMatches;

        card.hidden =
            !visible;

        if (visible) {
            visibleCount +=
                1;
        }
    });

    document
        .querySelectorAll(
            "#projects .project-category-group"
        )
        .forEach((group) => {
            group.hidden =
                ![
                    ...group.querySelectorAll(
                        ".project-card"
                    )
                ].some(
                    (card) =>
                        !card.hidden
                );
        });

    const count =
        document.getElementById(
            "project-result-count"
        );

    if (count) {
        count.textContent =
            `${visibleCount} ${
                visibleCount === 1
                    ? "project"
                    : "projects"
            }`;
    }
}


/* =========================================================
   REVIEWS / ADMIN INIT
   ========================================================= */

function initializeReviewsAndAdmin() {
    document
        .getElementById(
            "projects-back-button"
        )
        ?.addEventListener(
            "click",
            (event) => {
                event.preventDefault();
                exitProjectsFocus();
            }
        );

    document
        .querySelectorAll(
            "[data-review-view]"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () =>
                    setRecommendationView(
                        button.dataset.reviewView
                    )
            );
        });

    document
        .getElementById(
            "recommendation-form"
        )
        ?.addEventListener(
            "submit",
            submitRecommendation
        );

    document
        .getElementById(
            "refresh-recommendations"
        )
        ?.addEventListener(
            "click",
            loadPublicPortfolioContent
        );

    document
        .getElementById(
            "admin-login-form"
        )
        ?.addEventListener(
            "submit",
            submitAdminLogin
        );

    document
        .getElementById(
            "admin-project-form"
        )
        ?.addEventListener(
            "submit",
            submitAdminProject
        );

    document
        .getElementById(
            "admin-experience-form"
        )
        ?.addEventListener(
            "submit",
            submitAdminExperience
        );

    document
        .getElementById(
            "admin-window-entry-form"
        )
        ?.addEventListener(
            "submit",
            submitAdminWindowEntry
        );

    document
        .getElementById(
            "admin-resume-form"
        )
        ?.addEventListener(
            "submit",
            submitAdminResume
        );

    document
        .getElementById(
            "admin-refresh"
        )
        ?.addEventListener(
            "click",
            loadAdminDashboard
        );

    document
        .getElementById(
            "admin-logout"
        )
        ?.addEventListener(
            "click",
            () => {
                portfolioAdminToken =
                    "";

                sessionStorage.removeItem(
                    "portfolioAdminToken"
                );

                closeWindow(
                    "admin-panel"
                );
            }
        );

    document
        .querySelectorAll(
            "#projects .project-filter"
        )
        .forEach((button) => {
            button.addEventListener(
                "click",
                () =>
                    setTimeout(
                        applyAllProjectFilters,
                        0
                    )
            );
        });

    document
        .getElementById(
            "project-search-input"
        )
        ?.addEventListener(
            "input",
            () =>
                setTimeout(
                    applyAllProjectFilters,
                    0
                )
        );

    document.addEventListener(
        "click",
        (event) => {
            const menu =
                document.getElementById(
                    "more-menu"
                );

            const button =
                document.getElementById(
                    "more-button"
                );

            if (
                menu &&
                button &&
                !menu.contains(
                    event.target
                ) &&
                !button.contains(
                    event.target
                )
            ) {
                closeMoreMenu();
            }
        }
    );

    setRecommendationView(
        "write"
    );

    loadPublicPortfolioContent();
}


function setText(
    id,
    value
) {
    const element =
        document.getElementById(
            id
        );

    if (element) {
        element.textContent =
            value;
    }
}


/* =========================================================
   GLOBALS USED BY HTML
   ========================================================= */

window.openWindow =
    openWindow;

window.closeWindow =
    closeWindow;

window.minimizeWindow =
    minimizeWindow;

window.printResume =
    printResume;

window.toggleMoreMenu =
    toggleMoreMenu;

window.closeMoreMenu =
    closeMoreMenu;

window.openRecommendationsWindow =
    openRecommendationsWindow;

window.openReviewsWindow =
    openReviewsWindow;

window.openAdminLogin =
    openAdminLogin;

window.loadPublicPortfolioContent =
    loadPublicPortfolioContent;

window.enterProjectsFocus =
    enterProjectsFocus;

window.exitProjectsFocus =
    exitProjectsFocus;

window.setRecommendationView =
    setRecommendationView;