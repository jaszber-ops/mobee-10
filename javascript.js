// --- 1. IMPORT PARTYSOCKET & VERSION ---
import PartySocket from "https://cdn.jsdelivr.net/npm/partysocket@1.0.0/+esm";
import { VERSION } from './version.js';

// Keep service worker and cached assets in sync with the app version.
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register(`/service-worker.js?v=${VERSION}`, {
            updateViaCache: "none"
        }).catch((error) => {
            console.error("Service Worker registration failed:", error);
        });
    });
}

// --- iOS zoom suppression ---
function preventZoom(e) {
    e.preventDefault();
}

document.addEventListener('gesturestart', preventZoom, { passive: false });
document.addEventListener('gesturechange', preventZoom, { passive: false });
document.addEventListener('gestureend', preventZoom, { passive: false });

// Prevent double-tap zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

// Lock scale on orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
            viewport.setAttribute(
                'content',
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
            );
        }
    }, 300);
});

// Prevent horizontal swipe/bounce on iOS
let startX = 0;
let startY = 0;

document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = Math.abs(e.touches[0].clientY - startY);

    // If the gesture is mostly horizontal, block it.
    if (dx > dy + 3) {
        e.preventDefault();
    }
}, { passive: false });

// --- 2. CONFIGURATION ---
// All 30 available symbols - server picks 14 random ones each game
// Symbol names map directly to assets/symbols/{name}.png
const SYMBOLS = {
  'dog': 'assets/symbols/dog.png',
  'pigeon': 'assets/symbols/pigeon.png',
  'mobius': 'assets/symbols/mobius.png',
  'leaf': 'assets/symbols/leaf.png',
  'cat': 'assets/symbols/cat.png',
  'doll': 'assets/symbols/doll.png',
  'elephant': 'assets/symbols/elephant.png',
  'cherry': 'assets/symbols/cherry.png',
  'star': 'assets/symbols/star.png',
  'fan': 'assets/symbols/fan.png',
  'lion': 'assets/symbols/lion.png',
  'airplane': 'assets/symbols/airplane.png',
  'ufo': 'assets/symbols/ufo.png',
  'train': 'assets/symbols/train.png',
  'rhino': 'assets/symbols/rhino.png',
  'saturn': 'assets/symbols/saturn.png',
  'pig': 'assets/symbols/pig.png',
  'globe': 'assets/symbols/globe.png',
  'helicopter': 'assets/symbols/helicopter.png',
  'lightbulb': 'assets/symbols/lightbulb.png',
  'shark': 'assets/symbols/shark.png',
  'snowflake': 'assets/symbols/snowflake.png',
  'shoe': 'assets/symbols/shoe.png',
  'pawprint': 'assets/symbols/pawprint.png',
  'sunglasses': 'assets/symbols/sunglasses.png',
  'coffee': 'assets/symbols/coffee.png',
  'sailboat': 'assets/symbols/sailboat.png',
  'frenchhorn': 'assets/symbols/frenchhorn.png',
  'flower': 'assets/symbols/flower.png',
  'hourglass': 'assets/symbols/hourglass.png'
};

// Preload all symbols to avoid first-round pop-in
Object.values(SYMBOLS).forEach(src => { const im = new Image(); im.src = src; });


// SVG sprite sheet parameters
const SPRITE_SVG_URL = 'assets/mobee_sprite.svg';
const SPRITE_CELL_SIZE = 43.61;
const SPRITE_GRID_START_X = 137.47;
const SPRITE_GRID_START_Y = 88.01;

// --- 3. PARTYKIT CONNECTION ---
// Persistent Player ID (survives page reload)
// Generate short 4-character uppercase alphanumeric code
let playerId = localStorage.getItem('mobee_player_id');
if (!playerId) {
    // Generate alphanumeric code with better letter distribution
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like I, 1, O, 0
    playerId = '';
    for (let i = 0; i < 4; i++) {
        playerId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem('mobee_player_id', playerId);
}

// Server-assigned session token (received on connect)
let sessionToken = null;

// Avatar selection system
// Sprite sheet is 13 columns (A-M) x 10 rows (1-10) = 130 avatars
let selectedAvatar = localStorage.getItem('mobee_avatar') || '0,0'; // Default to top-left (A1)
let tempSelectedAvatar = selectedAvatar; // Temporary selection during modal

function initializeAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = '';

    // SVG grid parameters (measured from mobee_sprite.svg)
    const svgCellSize = 43.61; // Cell size in SVG units
    const gridStartX = 137.47; // Grid start in SVG units
    const gridStartY = 88.01;
    const displaySize = 48; // Display size in pixels
    const scaleFactor = displaySize / svgCellSize;

    // Generate 130 avatar options (13 cols x 10 rows)
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 13; col++) {
            const option = document.createElement('div');
            option.className = 'avatar-option';
            option.dataset.avatar = `${col},${row}`;

            // Calculate position to show this cell
            const cellLeft = gridStartX + (col * svgCellSize);
            const cellTop = gridStartY + (row * svgCellSize);

            // Scale to display size and negate to position
            const bgX = -(cellLeft * scaleFactor);
            const bgY = -(cellTop * scaleFactor);

            option.style.backgroundPosition = `${bgX}px ${bgY}px`;

            // Mark current selection
            if (`${col},${row}` === selectedAvatar) {
                option.classList.add('selected');
            }

            // Click handler - save immediately
            option.onclick = () => {
                document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');

                // Save immediately
                selectedAvatar = `${col},${row}`;
                localStorage.setItem('mobee_avatar', selectedAvatar);

                // Send to server if connected
                safeSend({
                    type: "UPDATE_AVATAR",
                    avatar: selectedAvatar
                });

                // Close modal after short delay
                setTimeout(() => closeAvatarModal(), 300);
            };

            grid.appendChild(option);
        }
    }
}

function openAvatarModal() {
    tempSelectedAvatar = selectedAvatar;
    initializeAvatarGrid();
    const modal = document.getElementById('avatar-modal');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

window.openAvatarModal = openAvatarModal;
window.closeAvatarModal = closeAvatarModal;

// Show avatar selector on first visit or from room modal
const hasSeenAvatarSelector = localStorage.getItem('mobee_avatar');
if (!hasSeenAvatarSelector) {
    // Will show after room selection
}

// Room Code System - go straight to lobby
const urlParams = new URLSearchParams(window.location.search);
const partykitOverride = urlParams.get('pk');
const isLocalHost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

// Track if user joined via a shared room link (had ?room= when page loaded)
const joinedViaRoomLink = urlParams.has('room') && !urlParams.has('lobby');

if (partykitOverride) {
    localStorage.setItem('mobee_partykit_host', partykitOverride);
}

const savedPartyKitHost = localStorage.getItem('mobee_partykit_host');

// PartyKit deployed host (allow local override for dev)
const PARTYKIT_HOST = partykitOverride
    || (isLocalHost ? (savedPartyKitHost || "127.0.0.1:1999") : "mobee-multi.jaszber-ops.partykit.dev");
let roomCode = urlParams.get('room');
let conn = null;

// Check if user clicked logo to go to lobby (?lobby parameter)
const isLobbyRequest = urlParams.has('lobby');
if (isLobbyRequest) {
    // Clear the query param and create a new room
    history.replaceState(null, null, window.location.pathname);
    localStorage.removeItem('mobee_last_room');
    // Generate a fresh random room code instead of using playerId
    // This ensures we always get a truly new room
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let freshRoomCode = '';
    for (let i = 0; i < 6; i++) {
        freshRoomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    roomCode = freshRoomCode;
}
// If no room code in URL, use last room or create new one with playerId
else if (!roomCode) {
    const lastRoomCode = localStorage.getItem('mobee_last_room');
    roomCode = lastRoomCode || playerId;
}

// Save room code to localStorage for next time
localStorage.setItem('mobee_last_room', roomCode);

// Show avatar selector if first time
if (!hasSeenAvatarSelector) {
    setTimeout(() => openAvatarModal(), 400);
}

// Initialize connection with automatic reconnection
function createConnection() {
    conn = new PartySocket({
        host: PARTYKIT_HOST,
        room: roomCode,
        query: { playerId }
    });

    // Add error handler
    conn.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        if (typeof Sentry !== 'undefined') {
            Sentry.captureException(error, {
                tags: { component: 'websocket' },
                extra: { roomCode: roomCode }
            });
        }
        msgTitle.innerText = "Connection Error";
        msgBody.innerHTML = "Lost connection to server. Attempting to reconnect...";
        msgEl.classList.remove('lost');
        msgEl.style.display = 'block';
    });

    // Add close handler for reconnection
    conn.addEventListener("close", (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        if (!event.wasClean) {
            // Unexpected close - attempt reconnection after delay
            setTimeout(() => {
                console.log("Attempting to reconnect...");
                createConnection();
            }, 2000);
        }
    });

    setupConnectionHandlers();
}

createConnection();

// Helper function to safely send messages
function safeSend(message) {
    if (conn && conn.readyState === WebSocket.OPEN) {
        try {
            conn.send(JSON.stringify(message));
        } catch (e) {
            console.error("Failed to send message:", e, message);
            if (typeof Sentry !== 'undefined') {
                Sentry.captureException(e, {
                    tags: { component: 'websocket' },
                    extra: { message: message, readyState: conn.readyState }
                });
            }
        }
    } else {
        console.warn("Cannot send message - connection not open:", message);
    }
}

// Make requestStartGame global and available before connection
window.requestStartGame = function() {
    safeSend({ type: "START_GAME" });
}

function setupConnectionHandlers() {

// Connection Feedback & Room Sharing
conn.addEventListener("open", () => {
    console.log("Connected to room:", roomCode);

    // Update URL to show room code (without reloading)
    const currentUrl = new URL(window.location);
    if (currentUrl.searchParams.get('room') !== roomCode) {
        currentUrl.searchParams.set('room', roomCode);
        history.replaceState(null, null, currentUrl);
    }

    // Clear any error messages
    if (msgEl.style.display === 'block' && msgTitle.innerText === "Connection Error") {
        msgEl.style.display = 'none';
    }

    // Send avatar to server
    safeSend({
        type: "UPDATE_AVATAR",
        avatar: selectedAvatar
    });

    // Show lobby instead of modal
    showLobby();
});

// UI Elements
const boardEl = document.getElementById('game-board');
const scoreEl = document.getElementById('score-el');
const msgEl = document.getElementById('message');
const msgTitle = document.getElementById('msg-title');
const msgBody = document.getElementById('msg-body');

// Lobby Elements
const lobbyEl = document.getElementById('lobby');
const lobbyCardsEl = document.getElementById('lobby-cards');
const friendsSectionEl = document.getElementById('friends-section');
const lobbyRoomCodeEl = document.getElementById('lobby-room-code');
const lobbyPlayersEl = document.getElementById('lobby-players');
const lobbyStartBtn = document.getElementById('lobby-start-btn');
const lobbyWaitingEl = document.getElementById('lobby-waiting');
const shareInviteBtn = document.getElementById('share-invite-btn');

// Game Timer
let gameStartTime = null;
let gameTimerInterval = null;
let pausedTime = 0; // Track time spent paused
let pauseStartTime = null;
const GAME_DURATION = 60; // seconds

// Single-player watchdog to prevent stuck games
let nextRoundWatchdog = null;
let awaitingRound = false;

function armNextRoundWatchdog(reason = "") {
    clearTimeout(nextRoundWatchdog);
    awaitingRound = true;

    // Give server a brief moment to push NEW_ROUND; then kick it.
    nextRoundWatchdog = setTimeout(() => {
        if (!awaitingRound) return;

        console.warn("No NEW_ROUND received, kicking START_GAME. reason=", reason);

        // Show minimal feedback so user doesn't think it's frozen
        msgTitle.innerText = "Resyncing…";
        msgBody.innerHTML = "Starting next round…";
        msgEl.classList.remove("lost");
        msgEl.style.display = "block";

        safeSend({ type: "START_GAME" });

        // Try once more if still no NEW_ROUND
        nextRoundWatchdog = setTimeout(() => {
            if (!awaitingRound) return;
            console.warn("Still no NEW_ROUND, kicking START_GAME again.");
            safeSend({ type: "START_GAME" });
        }, 1500);

    }, 800);
}

function disarmNextRoundWatchdog() {
    awaitingRound = false;
    clearTimeout(nextRoundWatchdog);
    nextRoundWatchdog = null;
}

// --- Lobby Functions ---
let isMultiplayerMode = false;
let currentHostId = null;

function setLobbyMode(mode) {
    const footerLink = document.querySelector('.footer-link');
    const isMultiplayerLobby = mode === 'multiplayer';

    if (lobbyCardsEl) {
        lobbyCardsEl.style.display = isMultiplayerLobby ? 'none' : 'block';
    }
    if (friendsSectionEl) {
        friendsSectionEl.style.display = isMultiplayerLobby ? 'block' : 'none';
    }
    if (footerLink) {
        footerLink.style.display = isMultiplayerLobby ? 'none' : 'block';
    }
}

function showLobby() {
    lobbyEl.style.display = 'flex';
    msgEl.style.display = 'none';
    lobbyRoomCodeEl.value = roomCode;
    const lobbyRoomLinkEl = document.getElementById('lobby-room-link');
    if (lobbyRoomLinkEl) {
        lobbyRoomLinkEl.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    }
    const boardContainer = document.getElementById('board-container');
    if (boardContainer) {
        boardContainer.style.display = 'none';
    }
    boardEl.innerHTML = '';
    resetLobbyButtons();

    // Check if we joined via a room link (someone else's room)
    if (joinedViaRoomLink) {
        // Joined someone's room - go straight to multiplayer view
        enterMultiplayerLobby();
    } else {
        // Fresh start - show lobby cards
        setLobbyMode('solo');
    }
}

function hideLobby() {
    lobbyEl.style.display = 'none';
    const boardContainer = document.getElementById('board-container');
    if (boardContainer) {
        boardContainer.style.display = 'flex';
    }
}

function enterMultiplayerLobby() {
    isMultiplayerMode = true;
    setLobbyMode('multiplayer');
    lobbyRoomCodeEl.value = roomCode;
    const lobbyRoomLinkEl = document.getElementById('lobby-room-link');
    if (lobbyRoomLinkEl) {
        lobbyRoomLinkEl.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    }
    resetLobbyButtons();
}

function resetLobbyButtons() {
    const lobbyBtn = document.getElementById('lobby-start-btn');
    if (lobbyBtn) {
        lobbyBtn.disabled = false;
        lobbyBtn.textContent = 'Start Game';
    }
}

// Global lobby button handlers (called from HTML onclick)
window.handlePlaySolo = function() {
    console.log("Play Solo clicked");
    isMultiplayerMode = false;
    const btn = document.getElementById('play-solo-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Starting...';
    }
    safeSend({ type: "START_GAME" });
};

window.handlePlayFriends = function() {
    console.log("Play with Friends clicked");
    enterMultiplayerLobby();
};

window.handleShareInvite = async function() {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const text = `Join my MØBEE game!\nRoom code: ${roomCode}`;

    if (navigator.share) {
        try {
            await navigator.share({ title: 'MØBEE', text, url });
        } catch (e) {
            // User cancelled or error - ignore
        }
    } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        const btn = document.getElementById('share-invite-btn');
        if (btn) {
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Share Invite'; }, 1500);
        }
    }
};

async function copyToClipboard(text, buttonEl, successLabel = "Copied!") {
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
    } else {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }
    if (buttonEl) {
        const originalText = buttonEl.textContent;
        buttonEl.textContent = successLabel;
        setTimeout(() => { buttonEl.textContent = originalText; }, 1500);
    }
}

window.handleCopyRoomCode = async function() {
    const input = document.getElementById('lobby-room-code');
    const codeValue = normalizeRoomCode(input ? input.value : roomCode) || roomCode;

    if (input) {
        input.value = codeValue;
        input.select();
        input.setSelectionRange(0, input.value.length); // iOS needs this
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(codeValue);
        } else if (input) {
            document.execCommand('copy');
        } else {
            await copyToClipboard(codeValue, null);
        }
    } catch (e) {
        console.error('Failed to copy room code:', e);
    }
};

window.handleCopyRoomLink = async function() {
    const lobbyRoomLinkEl = document.getElementById('lobby-room-link');
    const codeValue = normalizeRoomCode(document.getElementById('lobby-room-code')?.value || roomCode);
    const url = `${window.location.origin}${window.location.pathname}?room=${codeValue || roomCode}`;
    try {
        await copyToClipboard(url, null);
        // Visual feedback - flash blue
        if (lobbyRoomLinkEl) {
            lobbyRoomLinkEl.style.backgroundColor = '#e0f0ff';
            setTimeout(() => lobbyRoomLinkEl.style.backgroundColor = '', 300);
        }
    } catch (e) {
        console.error('Failed to copy room link:', e);
    }
};

function normalizeRoomCode(rawValue) {
    const value = (rawValue || '').trim().toUpperCase();
    if (!value) return '';
    const match = value.match(/[A-Z0-9]{4,6}/);
    return match ? match[0] : value;
}

window.handleJoinRoomCode = function() {
    const input = document.getElementById('lobby-room-code');
    if (!input) return;
    const code = normalizeRoomCode(input.value);
    if (code.length < 4) {
        alert('Please enter a valid room code');
        return;
    }
    window.location.href = `${window.location.pathname}?room=${code}`;
};

window.handleRoomCodeCardClick = function() {
    // Focus the input when clicking the card
    const input = document.getElementById('lobby-room-code');
    if (input) {
        input.focus();
        input.select();
    }
};

window.handleLobbyStart = function() {
    console.log("Start Game clicked");
    const btn = document.getElementById('lobby-start-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Starting...';
    }
    safeSend({ type: "START_GAME" });
};

function updateLobbyPlayers(scores, avatars) {
    if (!lobbyPlayersEl) return;

    const playerIds = Object.keys(scores);

    // Determine host (first player alphabetically - simple heuristic)
    currentHostId = playerIds.sort()[0];
    const isHost = playerId === currentHostId;

    // Build player avatars - same size, border color indicates current player
    lobbyPlayersEl.innerHTML = playerIds.map(id => {
        const isMe = id === playerId;
        const avatarHtml = getAvatarHTML(avatars[id], 36, { clickable: isMe, isMe });
        return avatarHtml;
    }).join('');

    // Show/hide start button based on host status
    if (isHost) {
        lobbyStartBtn.style.display = 'block';
        lobbyStartBtn.disabled = false;
        lobbyStartBtn.textContent = 'Start Game';
        lobbyWaitingEl.style.display = 'none';
    } else {
        lobbyStartBtn.style.display = 'none';
        lobbyWaitingEl.style.display = 'block';
    }
}

function startGameTimer() {
    // Don't set gameStartTime here - use server's time
    if (!gameStartTime) {
        console.warn("startGameTimer called but no gameStartTime set!");
        return;
    }

    if (gameTimerInterval) clearInterval(gameTimerInterval);

    gameTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameStartTime - pausedTime) / 1000);
        const remaining = Math.max(0, GAME_DURATION - elapsed);

        updateTimerDisplay(remaining);

        if (remaining === 0) {
            clearInterval(gameTimerInterval);
            endGame();
        }
    }, 100); // Update every 100ms for smooth countdown
}

function pauseTimer() {
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);

        // Calculate current elapsed time in seconds (rounded down)
        const currentElapsed = Math.floor((Date.now() - gameStartTime - pausedTime) / 1000);

        // Round UP to next full second (give player extra time)
        // This means if we're at 5.9 seconds, we go back to 5.0 seconds (add 1 second of time)
        const adjustedElapsed = currentElapsed; // Keep at current second, will increment on resume

        // Adjust pausedTime to align to clean second boundary
        pausedTime = Date.now() - gameStartTime - (adjustedElapsed * 1000);

        pauseStartTime = Date.now();

        // Add pause animation to timer display only
        const timerDisplay = scoreEl.querySelector('.timer-display');
        if (timerDisplay) {
            timerDisplay.classList.remove('resumed');
            timerDisplay.classList.add('paused');
        }
    }
}

function resumeTimer() {
    if (pauseStartTime) {
        // Add the actual pause duration (second boundary alignment already handled in pauseTimer)
        pausedTime += (Date.now() - pauseStartTime);
        pauseStartTime = null;
        startGameTimer();

        // Add resume animation to timer display only
        const timerDisplay = scoreEl.querySelector('.timer-display');
        if (timerDisplay) {
            timerDisplay.classList.remove('paused');
            timerDisplay.classList.add('resumed');

            // Remove animation class after it completes
            setTimeout(() => {
                timerDisplay.classList.remove('resumed');
            }, 300);
        }
    }
}

function updateTimerDisplay(seconds) {
    // Update only the number part to prevent layout shift
    const timerNumber = scoreEl.querySelector('.timer-number');
    if (timerNumber) {
        timerNumber.textContent = seconds;
    }
}

function endGame() {
    clearInterval(gameTimerInterval);

    // Tell server the game ended (so it can reset gameStartTime)
    safeSend({ type: "END_GAME" });

    // Get current scores to determine winner
    conn.addEventListener("message", (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === "UPDATE_SCORES") {
                showGameOverScreen(data.scores, data.avatars);
            }
        } catch (e) {
            console.error("Failed to parse message:", e, event.data);
            if (typeof Sentry !== 'undefined') {
                Sentry.captureException(e, {
                    tags: { component: 'message-parsing' },
                    extra: { rawData: event.data }
                });
            }
        }
    });

    // Request current scores
    safeSend({ type: "GET_SCORES" });
}

function showGameOverScreen(scores, avatars) {
    // Game ended - remove playing state
    document.body.classList.remove("playing");

    // Determine winner
    const sortedPlayers = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topScore = sortedPlayers[0][1];
    const myScore = scores[playerId] || 0;

    // Check if single player mode
    const playerCount = Object.keys(scores).length;
    const isSinglePlayer = playerCount === 1;

    // Show game over screen
    msgEl.classList.remove('lost'); // Reset border color by default
    if (isSinglePlayer) {
        // Single player mode - just show matches found
        msgTitle.innerText = "Time's up!";
        msgBody.innerHTML = `You found ${myScore} ${myScore === 1 ? 'match' : 'matches'}!`;
    } else {
        // Multiplayer mode - show winner/loser like round winner
        const topPlayers = sortedPlayers.filter(([id, score]) => score === topScore);
        const isTie = topPlayers.length > 1;

        if (isTie && myScore === topScore) {
            // It's a tie and I'm part of it
            msgTitle.innerText = "It's a Tie!";
            msgBody.innerHTML = `Final Score: ${myScore}`;
        } else if (myScore === topScore) {
            // I won outright - same format as round winner
            const myAvatar = getAvatarHTML(avatars[playerId]);
            msgTitle.innerHTML = `${myAvatar} You Won!`;
            msgBody.innerText = `Final Score: ${myScore}`;
        } else {
            // I lost - same format as round loser
            const winnerId = sortedPlayers[0][0];
            const winnerAvatar = getAvatarHTML(avatars[winnerId]);
            msgTitle.innerHTML = `You lost!`;
            msgBody.innerHTML = `Your Score: ${myScore}`;
            msgEl.classList.add('lost');
        }
    }

    msgEl.style.display = 'block';

    const startBtn = msgEl.querySelector('button');
    startBtn.innerText = "Play Again";
    startBtn.style.display = 'block';
    startBtn.onclick = () => {
        // Start a new game immediately
        msgEl.style.display = 'none';
        safeSend({ type: "START_GAME" });
    };
}

// --- 4. HANDLE SERVER EVENTS ---
conn.addEventListener("message", (event) => {
    let data;
    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.error("Failed to parse server message:", e, event.data);
        if (typeof Sentry !== 'undefined') {
            Sentry.captureException(e, {
                tags: { component: 'message-parsing' },
                extra: { rawData: event.data }
            });
        }
        return;
    }

    console.log("Server Msg:", data);

    switch (data.type) {
        case "ROOM_FULL":
            // Room is full - show error and disconnect
            alert(data.message || "This room is full (max 5 players). Please try a different room.");
            // Clear the room code so user gets a new one
            localStorage.removeItem('mobee_room');
            window.location.reload();
            break;

        case "SESSION":
            sessionToken = data.sessionToken;
            console.log("Session token received:", sessionToken.slice(0, 8) + "...");
            break;

        case "UPDATE_SCORES":
            updateScoreboard(data.scores, data.avatars);
            // Update lobby players if still in lobby
            if (!gameStartTime) {
                updateLobbyPlayers(data.scores, data.avatars);
            }
            break;

        case "NEW_ROUND":
            disarmNextRoundWatchdog();
            hideLobby();
            // Server sent 3 cards (arrays of IDs). Hide modal, show board.
            console.log("NEW_ROUND received:", {
                cards: data.cards,
                gameStartTime: data.gameStartTime,
                currentGameStartTime: gameStartTime
            });

            // Hide any modal and start playing immediately
            // (GAME_STARTING already handled the countdown for multiplayer)
            msgEl.style.display = 'none';
            document.body.classList.add("playing");
            renderBoard(data.cards);

            // Use server's game start time (all players synchronized)
            if (data.gameStartTime) {
                const isNewGame = !gameStartTime || data.gameStartTime !== gameStartTime;
                gameStartTime = data.gameStartTime;
                if (isNewGame) {
                    // Clear old timer and start fresh
                    if (gameTimerInterval) clearInterval(gameTimerInterval);
                    pausedTime = 0;
                    pauseStartTime = null;
                    startGameTimer();
                }
            }

            // Update scores AFTER setting gameStartTime so timer appears
            if (data.scores) {
                updateScoreboard(data.scores, data.avatars);
            }
            break;

        case "GAME_RESET":
            // Server reset the game for all players
            document.body.classList.remove("playing");
            gameStartTime = null;
            pausedTime = 0;
            pauseStartTime = null;
            if (gameTimerInterval) {
                clearInterval(gameTimerInterval);
            }
            updateScoreboard(data.scores, data.avatars);
            // Show lobby again
            msgEl.style.display = 'none';
            showLobby();
            break;

        case "WINNER":
            handleWinner(data);
            break;

        case "WRONG_GUESS":
            handleWrongGuess(data);
            break;

        case "JOIN_AS_SPECTATOR":
            // Joined mid-game - show cards but disable interaction
            console.log("Joined as spectator - watching current round");
            renderBoard(data.cards, true); // true = spectator mode

            // Update scores to show all players
            updateScoreboard(data.scores, data.avatars);

            // Show spectator message
            msgTitle.innerText = "Spectating";
            msgBody.innerHTML = `<p>You joined mid-game!<br>You'll play in the next round.</p>`;
            msgEl.classList.remove('lost');
            msgEl.style.display = 'block';

            // Start timer sync if game is running
            if (data.gameStartTime) {
                gameStartTime = data.gameStartTime;
                startGameTimer();
            }
            break;

        case "GAME_STARTING":
            // Game is about to start - show countdown
            console.log("Game starting countdown!");

            // Update scoreboard with current players
            updateScoreboard(data.scores, data.avatars);

            // Hide start button and show countdown
            const startBtn = msgEl.querySelector('button');
            startBtn.style.display = 'none';

            msgTitle.innerText = "Get Ready!";
            msgEl.style.display = 'block';

            // Start countdown from 3
            let startCountdown = data.countdown || 3;
            msgBody.innerHTML = `<div class="countdown-number">${startCountdown}</div>`;

            const startCountdownInterval = setInterval(() => {
                startCountdown--;
                if (startCountdown > 0) {
                    msgBody.innerHTML = `<div class="countdown-number">${startCountdown}</div>`;
                } else {
                    clearInterval(startCountdownInterval);
                    // Keep modal visible at same size - NEW_ROUND handler will hide it when cards arrive
                    msgBody.innerHTML = "&nbsp;";
                }
            }, 1000);
            break;
    }
});

// requestStartGame now defined globally above

// --- 5. RENDER THE BOARD (Server Driven) ---
// serverCards is: [[0,1,2,3,4,5,6], [0,7,8...], ...]
const ROTATIONS = [0, 180, -120, -60, 0, 60, 120];

// Scale the game board to fit available space
const BASE_BOARD_SIZE = 600; // Fixed base size in pixels

function scaleGameBoard() {
    const container = document.getElementById('board-container');
    const board = document.getElementById('game-board');
    if (!container || !board) return;

    // iPhone / small screens: CSS-only sizing (no JS scaling)
    if (window.matchMedia('(max-width: 430px)').matches) {
        board.style.transform = 'none';
        return;
    }

    // Desktop / iPad: keep existing scaling behavior
    const containerRect = container.getBoundingClientRect();
    const availableSize = Math.min(containerRect.width, containerRect.height);
    const scale = (availableSize / BASE_BOARD_SIZE) * 0.98;
    board.style.transform = `scale(${scale})`;
}

// Scale on load and resize
window.addEventListener('resize', scaleGameBoard);
window.addEventListener('orientationchange', () => {
    setTimeout(scaleGameBoard, 100); // Delay for orientation change
});
// Initial scale after DOM is ready
setTimeout(scaleGameBoard, 100);

function renderBoard(serverCards, isSpectator = false) {
    console.log("renderBoard called with:", serverCards, "spectator:", isSpectator);

    // Find and log the common symbol
    const c1 = serverCards[0];
    const c2 = serverCards[1];
    const c3 = serverCards[2];
    const commonSymbol = c1.find(s => c2.includes(s) && c3.includes(s));
    console.log("Common symbol across all cards:", commonSymbol);

    boardEl.innerHTML = '';

    serverCards.forEach((cardSymbolIds, cardIndex) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';

        // In spectator mode, disable pointer events to show cards are not interactive
        if (isSpectator) {
            cardEl.style.cursor = 'default';
            cardEl.style.pointerEvents = 'none';
        }

        // Draw Hexagon Shape with all 6 corners rounded symmetrically
        const svgBg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgBg.setAttribute("class", "card-bg");
        svgBg.setAttribute("viewBox", "0 0 260 300");
        // Hexagon path with all 6 corners rounded using quadratic bezier curves
        // r=15 corner radius, viewBox 260x300, center at 130,150
        svgBg.innerHTML = `<path class="card-shape" d="M143,12 L240,72 Q255,80 255,95 L255,205 Q255,220 240,228 L143,288 Q130,295 117,288 L20,228 Q5,220 5,205 L5,95 Q5,80 20,72 L117,12 Q130,5 143,12 Z" />`;
        cardEl.appendChild(svgBg);

        // Use server order exactly - no client-side shuffling
        // Both players must see identical cards!
        // Server now sends symbol names (strings) instead of IDs
        cardSymbolIds.forEach((symbolName, i) => {
            const symbolImg = SYMBOLS[symbolName];
            if (!symbolImg) return; // Safety check

            const symContainer = document.createElement('div');
            symContainer.className = `symbol-container pos-${i}`;
            symContainer.dataset.symbolId = symbolName;
            symContainer.style.transform = `translate(-50%, -50%) rotate(${ROTATIONS[i]}deg)`;

            // Gameplay symbols: use pre-rendered PNGs
            symContainer.innerHTML = `
                <img class="game-symbol" src="${symbolImg}" alt="" draggable="false">
            `;

            // --- CRITICAL: CLICK SENDS GUESS TO SERVER ---
            // Only enable clicks if NOT in spectator mode
            if (!isSpectator) {
                symContainer.onpointerdown = (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // Visual feedback immediately
                    const spriteElement = symContainer.querySelector('div, img');
                    spriteElement.style.transform = 'scale(1.5)';
                    setTimeout(() => spriteElement.style.transform = '', 200);

                    // Add green highlight to all cards
                    document.querySelectorAll('.card').forEach(c => c.classList.add('correct'));

                    // Vibrate all matching symbols across all cards (apply to inner sprite div)
                    document.querySelectorAll(`.symbol-container[data-symbol-id="${symbolName}"] img, .symbol-container[data-symbol-id="${symbolName}"] .symbol-sprite`).forEach(sprite => {
                        sprite.classList.add('symbol-match');
                        setTimeout(() => sprite.classList.remove('symbol-match'), 500);
                    });

                    // Send Guess (server will handle correct/wrong)
                    console.log("Clicking symbol:", symbolName, "on card:", cardIndex);
                    safeSend({
                        type: "GUESS",
                        symbol: symbolName,
                        cardIndex: cardIndex,  // Send which card was clicked
                        sessionToken: sessionToken  // Server validates this
                    });
                };
            }

            cardEl.appendChild(symContainer);
        });

        // Add small Møbee logo sticker to each card
        const stickerSize = 10;
        const sticker = document.createElement('div');
        sticker.className = 'card-symbol-sticker';
        sticker.innerHTML = `
            <div style="
                width: ${stickerSize}px;
                height: ${stickerSize}px;
                background-image: url('assets/mobee_logo_sm.png');
                background-size: contain;
                background-repeat: no-repeat;
                background-position: center;
                border-radius: 50%;
                background-color: white;
                filter: grayscale(100%) opacity(0.2);
            "></div>
        `;
        cardEl.appendChild(sticker);

        boardEl.appendChild(cardEl);
    });

    // Scale board after rendering
    scaleGameBoard();
}

function handleWinner(data) {
    // data.winnerId = playerId of the winner
    // data.winningSymbol = the correct symbol name
    // data.scores = updated scores

    // Pause timer FIRST before updating scoreboard
    pauseTimer();

    updateScoreboard(data.scores, data.avatars);

    const cards = document.querySelectorAll('.card');

    const winnerAvatar = getAvatarHTML(data.avatars[data.winnerId]);

    // Animate the winning symbol on all cards for all players
    if (data.winningSymbol !== undefined) {
        document.querySelectorAll(`.symbol-container[data-symbol-id="${data.winningSymbol}"] img, .symbol-container[data-symbol-id="${data.winningSymbol}"] .symbol-sprite`).forEach(sprite => {
            sprite.classList.add('symbol-match');
            setTimeout(() => sprite.classList.remove('symbol-match'), 500);
        });
    }

    // Check if single player mode (only 1 player)
    const playerCount = Object.keys(data.scores).length;
    const isSinglePlayer = playerCount === 1;

    // In single player mode, skip all messages and just show brief card animation
    if (isSinglePlayer) {
        // Arm watchdog in case NEW_ROUND doesn't arrive
        armNextRoundWatchdog("WINNER(single)");
        // Resume timer immediately
        setTimeout(() => {
            if (gameStartTime) resumeTimer();
        }, 10);
        return;
    }

    // Multiplayer mode - show winner message WITH countdown
    const isWinner = data.winnerId === playerId;

    if (isWinner) {
        // I WON! - cards already have 'correct' class from click
        msgTitle.innerHTML = `${winnerAvatar} You Won!`;
        msgEl.classList.remove('lost');
    } else {
        // OPPONENT WON - show red border immediately with symbol animation
        cards.forEach(c => c.classList.add('wrong'));
        msgTitle.innerHTML = `You lost!`;
        msgEl.classList.add('lost');
    }

    // Delay showing modal so players can see the symbol animation
    setTimeout(() => {
        // Show overlay with countdown
        msgEl.style.display = 'block';
        const startBtn = msgEl.querySelector('button');
        startBtn.style.display = 'none'; // Hide start button during countdown

        // Start countdown with winner message
        let countdown = 3;
        msgBody.innerHTML = `<div class="countdown-number">${countdown}</div>`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                msgBody.innerHTML = `<div class="countdown-number">${countdown}</div>`;
            } else {
                clearInterval(countdownInterval);
                // Resume timer after countdown
                if (gameStartTime) {
                    resumeTimer();
                }
                // Keep modal visible at same size - NEW_ROUND handler will hide it when cards arrive
                msgBody.innerHTML = "&nbsp;";
            }
        }, 1000);
    }, 600); // Delay modal to show symbol animation first
}

function handleWrongGuess(data) {
    // data.guesserId = playerId who guessed wrong
    // data.scores = updated scores

    // Pause timer FIRST before updating scoreboard
    pauseTimer();

    updateScoreboard(data.scores, data.avatars);

    const cards = document.querySelectorAll('.card');

    // Check if single player mode (only 1 player)
    const playerCount = Object.keys(data.scores).length;
    const isSinglePlayer = playerCount === 1;

    // In single player mode, skip all messages and just show brief card animation
    if (isSinglePlayer) {
        // Just flash the cards red briefly, no overlay
        cards.forEach(c => c.classList.add('wrong'));
        // Arm watchdog in case NEW_ROUND doesn't arrive
        armNextRoundWatchdog("WRONG_GUESS(single)");
        // Resume timer immediately
        setTimeout(() => {
            if (gameStartTime) resumeTimer();
        }, 10);
        return;
    }

    // Multiplayer mode - show full message
    if (data.guesserId === playerId) {
        // I guessed wrong!
        cards.forEach(c => c.classList.add('wrong'));
        msgTitle.innerText = "You Lost - WRONG!";
        msgBody.innerText = "Opponent wins the point!";
        msgEl.classList.add('lost');
    } else {
        // Opponent guessed wrong - I win!
        cards.forEach(c => c.classList.add('correct'));
        msgTitle.innerText = "You Win!";
        msgBody.innerText = "Opponent guessed wrong!";
        msgEl.classList.remove('lost');
    }

    // Multiplayer mode - show overlay with countdown
    msgEl.style.display = 'block';
    const startBtn = msgEl.querySelector('button');
    startBtn.style.display = 'none'; // Hide start button during countdown

    // Show message briefly, then start countdown
    setTimeout(() => {
        // Countdown from 3
        let countdown = 3;
        msgTitle.innerText = "Next Round";
        msgBody.innerHTML = `<div class="countdown-number">${countdown}</div>`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                msgBody.innerHTML = `<div class="countdown-number">${countdown}</div>`;
            } else {
                clearInterval(countdownInterval);
                // Resume timer after countdown
                if (gameStartTime) {
                    resumeTimer();
                }
                // Keep modal visible at same size - NEW_ROUND handler will hide it when cards arrive
                msgBody.innerHTML = "&nbsp;";
            }
        }, 1000);
    }, 1000); // Show message for 1 second first
}

// Helper function to create avatar sprite HTML
function getAvatarHTML(avatarCoords, size = 32, options = {}) {
    if (!avatarCoords) return '';
    const { clickable = false, isMe = false } = typeof options === 'boolean' ? { clickable: options } : options;

    const [col, row] = avatarCoords.split(',').map(Number);

    // SVG grid parameters (same as initializeAvatarGrid)
    const svgCellSize = 43.61;
    const gridStartX = 137.47;
    const gridStartY = 88.01;
    const scaleFactor = size / svgCellSize;

    // Calculate position to show this cell
    const cellLeft = gridStartX + (col * svgCellSize);
    const cellTop = gridStartY + (row * svgCellSize);

    // Scale and negate
    const bgX = -(cellLeft * scaleFactor);
    const bgY = -(cellTop * scaleFactor);

    // Calculate background size for this display size
    const svgWidth = 841.89;
    const svgHeight = 595.28;
    const bgWidth = svgWidth * scaleFactor;
    const bgHeight = svgHeight * scaleFactor;

    const clickStyle = clickable ? 'cursor: pointer;' : '';
    const clickHandler = clickable ? 'onclick="openAvatarModal()"' : '';
    // Use green border for current player, default gray for others
    const borderColor = isMe ? '#BEC887' : '#ccc';

    return `<span class="avatar-sprite" style="width: ${size}px; height: ${size}px; background-size: ${bgWidth}px ${bgHeight}px; background-position: ${bgX}px ${bgY}px; vertical-align: middle; margin-right: 4px; border-color: ${borderColor}; ${clickStyle}" ${clickHandler}></span>`;
}

function updateScoreboard(scores, avatars = {}) {
    // scores is { "playerId_1": 5, "playerId_2": 3 }

    // Convert to array and sort by score (highest first)
    const sortedPlayers = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    // Assign ranks considering ties
    let currentRank = 1;
    let previousScore = null;

    const scoreboardParts = sortedPlayers.map(([id, score], index) => {
        // If score changed, update rank to current position
        if (previousScore !== null && score < previousScore) {
            currentRank = index + 1;
        }
        previousScore = score;

        // Same size for all, border color indicates current player
        const isMe = id === playerId;
        const isClickable = isMe && !gameStartTime; // Only your own avatar is clickable, and only in lobby
        const avatar = getAvatarHTML(avatars[id], 36, { clickable: isClickable, isMe });

        // In lobby (no gameStartTime), only show avatar. During game, show avatar + score
        if (gameStartTime) {
            return `${avatar}${score}`;
        } else {
            return avatar;
        }
    });

    const scoreText = scoreboardParts.join('  ');

    // Add timer if game has started
    if (gameStartTime) {
        const elapsed = Math.floor((Date.now() - gameStartTime - pausedTime) / 1000);
        const remaining = Math.max(0, GAME_DURATION - elapsed);
        scoreEl.innerHTML = `${scoreText}<span class="timer-display"><span style="margin-right: 8px;">Time:</span><span class="timer-number">${remaining}</span>s</span>`;
    } else {
        scoreEl.innerHTML = scoreText;
    }
}

} // End setupConnectionHandlers

// Shop modal functions
const totalCarouselImages = 15;
let currentCarouselIndex = 0;

window.openShopModal = function() {
    // Pick a random image
    currentCarouselIndex = Math.floor(Math.random() * totalCarouselImages);
    updateCarouselImage();

    const modal = document.getElementById('shop-modal');
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

window.closeShopModal = function() {
    const modal = document.getElementById('shop-modal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

function updateCarouselImage() {
    const url = `assets/mobee-box/mobee-box${currentCarouselIndex + 1}.jpg`;

    // Update shop modal carousel
    const modalImg = document.getElementById('carousel-image');
    if (modalImg) modalImg.src = url;

    // Update lobby carousel
    const lobbyImg = document.getElementById('lobby-carousel-image');
    if (lobbyImg) lobbyImg.src = url;
}

window.handleImageClick = function(event) {
    event.stopPropagation();
    event.preventDefault();

    // Next image
    currentCarouselIndex = (currentCarouselIndex + 1) % totalCarouselImages;
    updateCarouselImage();
}

// Invite modal functions
window.openInviteModal = function() {
    const modal = document.getElementById('invite-modal');
    const roomCodeInput = document.getElementById('invite-room-code-editable');
    const shareUrlInput = document.getElementById('invite-share-url');

    // Use the global roomCode variable
    updateShareUrl();

    // Populate the inputs
    roomCodeInput.value = roomCode;
    shareUrlInput.value = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

    // Update share URL when room code is edited
    roomCodeInput.addEventListener('input', updateShareUrl);

    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

function updateShareUrl() {
    const roomCodeInput = document.getElementById('invite-room-code-editable');
    const shareUrlInput = document.getElementById('invite-share-url');
    const code = roomCodeInput.value.trim().toUpperCase();
    shareUrlInput.value = `${window.location.origin}${window.location.pathname}?room=${code}`;
}

window.closeInviteModal = function() {
    const modal = document.getElementById('invite-modal');
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
}

window.joinRoomFromInvite = function() {
    const roomCodeInput = document.getElementById('invite-room-code-editable');
    const newRoomCode = roomCodeInput.value.trim().toUpperCase();

    if (!newRoomCode) {
        alert('Please enter a room code');
        return;
    }

    // Always navigate to the room (even if same room, to trigger reload)
    window.location.href = `${window.location.pathname}?room=${newRoomCode}`;
}

// Copy invite link to clipboard when clicked
document.addEventListener('DOMContentLoaded', () => {
    // Display version
    console.log('Møbee Multi v' + VERSION);
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
        versionDisplay.textContent = 'v' + VERSION;
    }

    // Auto-advance lobby carousel every 3 seconds
    setInterval(() => {
        const lobbyEl = document.getElementById('lobby');
        if (lobbyEl && lobbyEl.style.display !== 'none') {
            currentCarouselIndex = (currentCarouselIndex + 1) % totalCarouselImages;
            updateCarouselImage();
        }
    }, 3000);

    const inviteShareUrlInput = document.getElementById('invite-share-url');
    const inviteCopyHint = document.getElementById('invite-copy-hint');
    const roomCodeInput = document.getElementById('invite-room-code-editable');

    if (inviteShareUrlInput && inviteCopyHint) {
        const copyHandler = async () => {
            try {
                await navigator.clipboard.writeText(inviteShareUrlInput.value);
                inviteCopyHint.textContent = 'Link copied!';
                inviteCopyHint.style.color = '#BFCA86';
                setTimeout(() => {
                    inviteCopyHint.textContent = 'Click to copy link';
                    inviteCopyHint.style.color = '#666';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };

        inviteShareUrlInput.addEventListener('click', copyHandler);
        inviteCopyHint.addEventListener('click', copyHandler);
    }

    // Copy room code to clipboard when clicked (with iOS fallback)
    if (roomCodeInput) {
        const copyRoomCode = async function() {
            this.select();
            this.setSelectionRange(0, this.value.length); // iOS needs this

            const textToCopy = this.value;

            // Try modern clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    console.log('Room code copied via clipboard API');
                    // Visual feedback
                    this.style.backgroundColor = '#3a4a2a';
                    setTimeout(() => this.style.backgroundColor = '', 300);
                    return;
                } catch (err) {
                    console.warn('Clipboard API failed:', err);
                }
            }

            // Fallback for iOS Safari
            try {
                document.execCommand('copy');
                console.log('Room code copied via execCommand');
                this.style.backgroundColor = '#3a4a2a';
                setTimeout(() => this.style.backgroundColor = '', 300);
            } catch (err) {
                console.error('All copy methods failed:', err);
            }
        };

        roomCodeInput.addEventListener('click', copyRoomCode);
        roomCodeInput.addEventListener('focus', function() {
            this.select();
        });
    }

    const lobbyCodeInput = document.getElementById('lobby-room-code');
    if (lobbyCodeInput) {
        lobbyCodeInput.addEventListener('focus', () => {
            setTimeout(() => lobbyCodeInput.select(), 0);
        });
        lobbyCodeInput.addEventListener('click', () => {
            window.handleCopyRoomCode();
        });
        lobbyCodeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                window.handleJoinRoomCode();
            }
        });
    }

    const lobbyRoomLinkEl = document.getElementById('lobby-room-link');
    if (lobbyRoomLinkEl) {
        const copyLink = async () => {
            lobbyRoomLinkEl.select();
            lobbyRoomLinkEl.setSelectionRange(0, lobbyRoomLinkEl.value.length);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(lobbyRoomLinkEl.value);
                } else {
                    document.execCommand('copy');
                }
                // Visual feedback - flash blue like room code
                lobbyRoomLinkEl.style.backgroundColor = '#e0f0ff';
                setTimeout(() => lobbyRoomLinkEl.style.backgroundColor = '', 300);
            } catch (e) {
                console.error('Failed to copy room link:', e);
            }
        };
        lobbyRoomLinkEl.addEventListener('click', copyLink);
        lobbyRoomLinkEl.addEventListener('focus', () => {
            setTimeout(() => lobbyRoomLinkEl.select(), 0);
        });
    }
});
