// --- 1. IMPORT PARTYSOCKET & VERSION ---
import PartySocket from "https://cdn.jsdelivr.net/npm/partysocket@1.0.0/+esm";
import { VERSION } from './version.js';

// --- 2. CONFIGURATION ---
// The visual assets. Order must match server IDs (0-13)
// Using sprite coordinates [col, row] from mobee_sprite.svg (0-indexed)
// User provided 1-indexed coordinates: row_col, converted to 0-indexed [col-1, row-1]
const SYMBOLS = [
    { id: 0,  name: 'Helicopter', sprite: [5, 2] },   // 3_6 → col 6-1=5, row 3-1=2
    { id: 1,  name: 'UFO',        sprite: [4, 3] },   // 4_5 → col 5-1=4, row 4-1=3
    { id: 2,  name: 'Shark',      sprite: [11, 4] },  // 5_12 → col 12-1=11, row 5-1=4
    { id: 3,  name: 'Pig',        sprite: [10, 9] },  // 10_11 → col 11-1=10, row 10-1=9
    { id: 4,  name: 'Rhino',      sprite: [7, 9] },   // 10_8 → col 8-1=7, row 10-1=9
    { id: 5,  name: 'Pretzel',    sprite: [8, 7] },   // 8_9 → col 9-1=8, row 8-1=7
    { id: 6,  name: 'Shoe',       sprite: [3, 0] },   // 1_4 → col 4-1=3, row 1-1=0
    { id: 7,  name: 'Sunglasses', sprite: [12, 1] },  // 2_13 → col 13-1=12, row 2-1=1
    { id: 8,  name: 'Star',       sprite: [8, 9] },   // 10_9 → col 9-1=8, row 10-1=9
    { id: 9,  name: 'Elephant',   sprite: [12, 7] },  // 8_13 → col 13-1=12, row 8-1=7
    { id: 10, name: 'Lion',       sprite: [0, 3] },   // 4_1 → col 1-1=0, row 4-1=3
    { id: 11, name: 'Sailboat',   sprite: [5, 6] },   // 7_6 → col 6-1=5, row 7-1=6
    { id: 12, name: 'Cat',        sprite: [9, 9] },   // 10_10 → col 10-1=9, row 10-1=9
    { id: 13, name: 'Dog',        sprite: [7, 8] }    // 9_8 → col 8-1=7, row 9-1=8
];

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

// PartyKit deployed host
const PARTYKIT_HOST = "mobee-multi.jaszber-ops.partykit.dev";

// Room Code System - go straight to lobby
const urlParams = new URLSearchParams(window.location.search);
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

    // Clear any error messages
    if (msgEl.style.display === 'block' && msgTitle.innerText === "Connection Error") {
        msgEl.style.display = 'none';
    }

    // Send avatar to server
    safeSend({
        type: "UPDATE_AVATAR",
        avatar: selectedAvatar
    });

    // Show invite link
    msgBody.innerHTML = `
        <p style="font-size: 0.9rem; color: #666; margin-bottom: 15px;">Flip 3 cards and find the unique shared symbol!</p>
        <a href="#" onclick="openInviteModal(); return false;" style="font-size: 1rem; color: #4a90e2; text-decoration: underline; font-weight: 600; cursor: pointer;">Play with friends!</a>
    `;

    // Show the message element
    msgEl.classList.remove('lost');
    msgEl.style.display = 'block';
});

// UI Elements
const boardEl = document.getElementById('game-board');
const scoreEl = document.getElementById('score-el');
const msgEl = document.getElementById('message');
const msgTitle = document.getElementById('msg-title');
const msgBody = document.getElementById('msg-body');

// Game Timer
let gameStartTime = null;
let gameTimerInterval = null;
let pausedTime = 0; // Track time spent paused
let pauseStartTime = null;
const GAME_DURATION = 60; // seconds

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
        // Add 1 second (1000ms) to give players a full second after resume
        pausedTime += (Date.now() - pauseStartTime) + 1000;
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
        // Reset scores and immediately start new game
        safeSend({ type: "RESET_GAME" });
        // After a brief moment, start the first round
        setTimeout(() => {
            safeSend({ type: "START_GAME" });
        }, 100);
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
            break;

        case "NEW_ROUND":
            // Server sent 3 cards (arrays of IDs). Hide modal, show board.
            console.log("NEW_ROUND received:", {
                cards: data.cards,
                gameStartTime: data.gameStartTime,
                currentGameStartTime: gameStartTime
            });

            // Check if this is a new game (first round) and multiplayer
            const isFirstRound = data.gameStartTime && (!gameStartTime || data.gameStartTime !== gameStartTime);
            const playerCount = data.scores ? Object.keys(data.scores).length : 1;
            const isMultiplayer = playerCount > 1;

            // Show 3-2-1 countdown at game start for multiplayer only
            if (isFirstRound && isMultiplayer) {
                // Show countdown overlay
                msgTitle.innerText = "Get Ready!";
                msgBody.innerHTML = `<div class="countdown-number">3</div>`;
                msgEl.style.display = 'block';
                const startBtn = msgEl.querySelector('button');
                startBtn.style.display = 'none';

                let countdown = 3;
                const countdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        msgBody.innerHTML = `<div class="countdown-number">${countdown}</div>`;
                    } else {
                        clearInterval(countdownInterval);
                        // Countdown done - now start the game
                        msgEl.style.display = 'none';
                        document.body.classList.add("playing");
                        renderBoard(data.cards);

                        // Set game start time and start timer
                        gameStartTime = data.gameStartTime;
                        if (gameTimerInterval) clearInterval(gameTimerInterval);
                        pausedTime = 0;
                        pauseStartTime = null;
                        startGameTimer();

                        // Update scoreboard
                        if (data.scores) {
                            updateScoreboard(data.scores, data.avatars);
                        }
                    }
                }, 1000);
            } else {
                // Normal flow: no countdown (single player or mid-game round)
                msgEl.style.display = 'none';
                document.body.classList.add("playing");
                renderBoard(data.cards);

                // Use server's game start time (all players synchronized)
                // Always update if server sends a new timestamp
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
            // Hide the message overlay - new game will start immediately
            msgEl.style.display = 'none';
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
                    msgBody.innerHTML = "GO!";
                    // Server will send NEW_ROUND shortly
                }
            }, 1000);
            break;
    }
});

// requestStartGame now defined globally above

// --- 5. RENDER THE BOARD (Server Driven) ---
// serverCards is: [[0,1,2,3,4,5,6], [0,7,8...], ...]

// Symbol positions in SVG viewBox coordinates (0-100 space)
const SYMBOL_POSITIONS = [
  { x: 50, y: 57.5 }, // center
  { x: 50, y: 24 },   // top
  { x: 78, y: 40 },   // top-right
  { x: 78, y: 75 },   // bottom-right
  { x: 50, y: 91 },   // bottom
  { x: 22, y: 75 },   // bottom-left
  { x: 22, y: 40 },   // top-left
];

// Rotations for each symbol position (degrees)
const ROTATIONS = [0, 180, -120, -60, 0, 60, 120];

// Symbol size in SVG viewBox units (single tuning knob)
const SYMBOL_SIZE = 26;

// Rounded hexagon path for viewBox 0 0 100 115
// 6-way symmetric hexagon with all corners equally rounded
// Center at (50, 57.5), radius ~50, corner radius ~8
const HEX_PATH = `
  M 50 8
  Q 58 8 62 12
  L 88 32
  Q 94 36 94 44
  L 94 71
  Q 94 79 88 83
  L 62 103
  Q 58 107 50 107
  Q 42 107 38 103
  L 12 83
  Q 6 79 6 71
  L 6 44
  Q 6 36 12 32
  L 38 12
  Q 42 8 50 8
  Z
`.replace(/\s+/g, ' ').trim();

// Initialize SVG symbol definitions on page load
function initSymbolDefs() {
  const defsContainer = document.getElementById('symbol-defs');
  if (!defsContainer) return;

  // Create a <defs> element with <symbol> for each game symbol
  let defsHTML = '<defs>';

  SYMBOLS.forEach(symbolObj => {
    const [col, row] = symbolObj.sprite;

    // Calculate sprite position
    const cellLeft = SPRITE_GRID_START_X + (col * SPRITE_CELL_SIZE);
    const cellTop = SPRITE_GRID_START_Y + (row * SPRITE_CELL_SIZE);

    // Each symbol is defined with its own viewBox matching the sprite cell
    defsHTML += `
      <symbol id="sym-${symbolObj.id}" viewBox="${cellLeft} ${cellTop} ${SPRITE_CELL_SIZE} ${SPRITE_CELL_SIZE}">
        <image href="${SPRITE_SVG_URL}" width="841.89" height="595.28" />
      </symbol>
    `;
  });

  defsHTML += '</defs>';
  defsContainer.innerHTML = defsHTML;
}

// Render a single card as SVG
function renderCardSVG(symbolIds) {
  const half = SYMBOL_SIZE / 2;

  const symbols = symbolIds.map((id, i) => {
    const { x, y } = SYMBOL_POSITIONS[i];
    const rotation = ROTATIONS[i];
    // Rotate around symbol center
    const transform = rotation !== 0 ? `transform="rotate(${rotation} ${x} ${y})"` : '';

    return `<use href="#sym-${id}"
                 x="${x - half}"
                 y="${y - half}"
                 width="${SYMBOL_SIZE}"
                 height="${SYMBOL_SIZE}"
                 ${transform}
                 data-symbol-id="${id}"
                 class="card-symbol" />`;
  }).join("");

  return `
    <svg class="card-svg"
         viewBox="0 0 100 115"
         preserveAspectRatio="xMidYMid meet">
      <path class="card-shape" d="${HEX_PATH}" />
      ${symbols}
    </svg>
  `;
}

// Call on page load
setTimeout(initSymbolDefs, 0);

// Scale the game board to fit available space
const BASE_BOARD_SIZE = 600; // Fixed base size in pixels

function scaleGameBoard() {
    const container = document.getElementById('board-container');
    const board = document.getElementById('game-board');
    if (!container || !board) return;

    // iPhone: let CSS size the board, do not transform-scale (prevents gutters)
    if (window.matchMedia('(max-width: 430px)').matches) {
        board.style.transform = '';
        return;
    }

    // Get available space
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    const availableHeight = containerRect.height;

    // Use the smaller dimension to maintain aspect ratio
    const availableSize = Math.min(availableWidth, availableHeight);

    // Calculate scale factor to fill available space (use 98% to leave small margin)
    const scale = (availableSize / BASE_BOARD_SIZE) * 0.98;

    // Apply scale transform - this scales the entire board uniformly
    board.style.transform = `scale(${scale})`;

    // Debug: show values on screen for mobile testing
    console.log('Scale debug:', {
        containerW: availableWidth,
        containerH: availableHeight,
        availableSize,
        scale,
        windowW: window.innerWidth,
        windowH: window.innerHeight
    });
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
    const commonSymbolId = c1.find(s => c2.includes(s) && c3.includes(s));
    console.log("Common symbol across all cards:", commonSymbolId);

    boardEl.innerHTML = '';

    serverCards.forEach((cardSymbolIds, cardIndex) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';

        // In spectator mode, disable pointer events to show cards are not interactive
        if (isSpectator) {
            cardEl.style.cursor = 'default';
            cardEl.style.pointerEvents = 'none';
        }

        // Render card as single SVG with all symbols inside
        cardEl.innerHTML = renderCardSVG(cardSymbolIds);

        // --- CRITICAL: CLICK HANDLING FOR SYMBOLS ---
        // Only enable clicks if NOT in spectator mode
        if (!isSpectator) {
            // Add click handlers to each symbol in the SVG
            const symbols = cardEl.querySelectorAll('.card-symbol');
            symbols.forEach(symbolEl => {
                const symbolId = parseInt(symbolEl.getAttribute('data-symbol-id'));

                symbolEl.style.cursor = 'pointer';
                symbolEl.onpointerdown = (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    // Visual feedback - scale the clicked symbol
                    symbolEl.style.transform = symbolEl.style.transform
                        ? symbolEl.style.transform + ' scale(1.3)'
                        : 'scale(1.3)';
                    setTimeout(() => {
                        symbolEl.style.transform = symbolEl.style.transform.replace(' scale(1.3)', '').replace('scale(1.3)', '');
                    }, 200);

                    // Add green highlight to all cards
                    document.querySelectorAll('.card').forEach(c => c.classList.add('correct'));

                    // Vibrate all matching symbols across all cards
                    document.querySelectorAll(`.card-symbol[data-symbol-id="${symbolId}"]`).forEach(sym => {
                        sym.classList.add('symbol-match');
                        setTimeout(() => sym.classList.remove('symbol-match'), 500);
                    });

                    // Send Guess (server will handle correct/wrong)
                    console.log("Clicking symbol:", symbolId, "on card:", cardIndex);
                    safeSend({
                        type: "GUESS",
                        symbol: symbolId,
                        cardIndex: cardIndex,
                        sessionToken: sessionToken
                    });
                };
            });
        }

        boardEl.appendChild(cardEl);
    });

    // Scale board after rendering
    scaleGameBoard();
}

function handleWinner(data) {
    // data.winnerId = playerId of the winner
    // data.winningSymbol = the correct symbol ID
    // data.scores = updated scores

    // Pause timer FIRST before updating scoreboard
    pauseTimer();

    updateScoreboard(data.scores, data.avatars);

    const cards = document.querySelectorAll('.card');

    const winnerAvatar = getAvatarHTML(data.avatars[data.winnerId]);

    // Animate the winning symbol on all cards for all players
    if (data.winningSymbol !== undefined) {
        document.querySelectorAll(`.symbol-container[data-symbol-id="${data.winningSymbol}"] > div`).forEach(sprite => {
            sprite.classList.add('symbol-match');
            setTimeout(() => sprite.classList.remove('symbol-match'), 500);
        });
    }

    // Check if single player mode (only 1 player)
    const playerCount = Object.keys(data.scores).length;
    const isSinglePlayer = playerCount === 1;

    // In single player mode, skip all messages and just show brief card animation
    if (isSinglePlayer) {
        // The clicked card already has 'correct' class, no need to add to all
        // Resume timer immediately
        setTimeout(() => {
            if (gameStartTime) {
                resumeTimer();
            }
        }, 10);
    } else {
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
                    // Server will auto-send next round - just wait for it
                    msgBody.innerHTML = "Ready...";
                }
            }, 1000);
        }, 600); // Delay modal to show symbol animation first
    }
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

        // Resume timer immediately
        setTimeout(() => {
            if (gameStartTime) {
                resumeTimer();
            }
        }, 10);
    } else {
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
                    // Server will auto-send next round - just wait for it
                    msgBody.innerHTML = "Ready...";
                }
            }, 1000);
        }, 1000); // Show message for 1 second first
    }
}

// Helper function to create avatar sprite HTML
function getAvatarHTML(avatarCoords, size = 32, clickable = false) {
    if (!avatarCoords) return '';
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

    return `<span class="avatar-sprite" style="width: ${size}px; height: ${size}px; background-size: ${bgWidth}px ${bgHeight}px; background-position: ${bgX}px ${bgY}px; vertical-align: middle; margin-right: 4px; ${clickStyle}" ${clickHandler}></span>`;
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

        // Make your avatar bigger (40px vs 28px for others) and clickable only in lobby
        const avatarSize = id === playerId ? 40 : 28;
        const isClickable = id === playerId && !gameStartTime; // Only your own avatar is clickable, and only in lobby
        const avatar = getAvatarHTML(avatars[id], avatarSize, isClickable);

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
    const img = document.getElementById('carousel-image');
    img.src = `assets/mobee-box/mobee-box${currentCarouselIndex + 1}.jpg`;
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

    // Select all text in room code input when clicked
    if (roomCodeInput) {
        roomCodeInput.addEventListener('click', function() {
            this.select();
        });
        // Also select on focus (e.g., when tabbing to it)
        roomCodeInput.addEventListener('focus', function() {
            this.select();
        });
    }
});
