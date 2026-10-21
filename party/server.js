/**
 * Møbee Multi - PartyServer (Cloudflare Workers + Durable Objects)
 *
 * Ported from PartyKit in Oct 2026 when the hosted platform shut down.
 * Same room model: one Durable Object per room code, in-memory connections
 * (hibernation off, so setTimeout and per-connection fields keep working).
 *
 * Real-time multiplayer game server handling:
 * - Player connections and disconnections
 * - Game state management (rounds, scores, levels)
 * - Guess validation and scoring
 * - Session security and rate limiting
 */

import { Server, routePartykitRequest } from "partyserver";
import { generateDeck } from "./game-math.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const LEVEL_UP_THRESHOLD = 6;     // Score needed to qualify for level 2
const LEVEL_DOWN_THRESHOLD = 0;   // Score at which player drops back to level 1
const MAX_PLAYERS = 5;            // Maximum players per room
const GAME_DURATION_MS = 60000;   // 60 second game duration
const COUNTDOWN_DURATION_MS = 3000; // 3 second countdown before game starts
const GUESS_RATE_LIMIT_MS = 150;  // Minimum ms between guesses
const MISS_LOCKOUT_MS = 1000;     // A wrong tap locks that player out for this long; the round continues
const RECONNECT_GRACE_MS = 20000; // A dropped socket keeps its seat and score for this long
const SINGLE_PLAYER_DELAY = 300;  // Delay between rounds (single player)
const MULTI_PLAYER_DELAY = 4000;  // Delay between rounds (multiplayer)

const DEFAULT_ASSET_ORIGIN = "https://mobee-10.trippplecard.games"; // where the symbol PNGs live (override with the ASSET_ORIGIN var)
const pngCache = new Map();                                    // symbol name → Promise<ArrayBuffer>
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Deck positions for cycling through unique 3-card combinations
const DECK_POSITIONS = {
  1: [0, 3, 6, 1, 4, 7, 2, 5],           // Level 1: 8 cards
  2: [0, 3, 6, 9, 2, 5, 8, 1, 4, 7]      // Level 2: 10 cards
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Fisher-Yates shuffle for unbiased random array ordering
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Create a broadcast payload with common fields
 */
function createPayload(type, state, extra = {}) {
  return JSON.stringify({
    type,
    scores: state.scores,
    playerLevels: state.playerLevels,
    avatars: state.avatars,
    hostId: state.hostId,
    away: Object.keys(state.away || {}),
    ...extra
  });
}

// =============================================================================
// MAIN SERVER CLASS
// =============================================================================

export class MobeeServer extends Server {
  static options = { hibernate: false };

  constructor(ctx, env) {
    super(ctx, env);
    // Message queue ensures sequential processing of async operations
    this._queue = Promise.resolve();
  }

  get storage() { return this.ctx.storage; }

  // ---------------------------------------------------------------------------
  // STATE INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Create initial game state for a new room
   */
  createInitialState(hostId) {
    const deckData = generateDeck(1);
    return {
      deck: deckData.cards,
      symbolSet: deckData.symbolSet,
      currentLevel: 1,
      status: "waiting",
      scores: {},
      playerLevels: {},
      avatars: {},
      qualifiedForLevel: {},
      currentAnswer: null,
      currentShuffledCards: null,
      currentDeckIndices: null,
      shuffledDeckOrder: null,
      deckPositionIndex: null,
      gameStartTime: null,
      gameEndsAt: null,
      countdownStartAt: null,
      away: {},          // playerId → ms timestamp of disconnect, while inside the reconnect grace
      hostId
    };
  }

  /**
   * Ensure state has all required fields (handles legacy rooms)
   */
  migrateState(state, defaultHostId) {
    state.avatars = state.avatars || {};
    state.playerLevels = state.playerLevels || {};
    state.qualifiedForLevel = state.qualifiedForLevel || {};
    state.currentLevel = state.currentLevel || 1;
    state.away = state.away || {};

    if (!state.hostId) {
      const existingPlayers = Object.keys(state.scores);
      state.hostId = existingPlayers.length > 0
        ? existingPlayers.sort()[0]
        : defaultHostId;
    }

    return state;
  }

  // ---------------------------------------------------------------------------
  // DECK & ROUND MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Switch to a new difficulty level
   */
  async switchLevel(state, newLevel) {
    console.log(`Switching to level ${newLevel}`);

    state.currentLevel = newLevel;
    const deckData = generateDeck(newLevel);
    state.deck = deckData.cards;
    state.symbolSet = deckData.symbolSet;

    // Reset deck position for fresh shuffle
    state.deckPositionIndex = null;
    state.shuffledDeckOrder = null;

    return state;
  }

  /**
   * Generate and broadcast a new round of cards
   */
  async startNewRound(state) {
    // Don't start if game has ended
    if (!state.gameStartTime) {
      console.log("startNewRound: game has ended, skipping");
      return;
    }

    const level = state.currentLevel || 1;
    const positions = DECK_POSITIONS[level];
    const deckSize = state.deck.length;

    // Initialize or advance deck position
    if (state.deckPositionIndex == null) {
      // First round - shuffle deck order
      state.shuffledDeckOrder = shuffle([...Array(deckSize).keys()]);
      state.deckPositionIndex = 0;
      console.log("New game - shuffled deck:", state.shuffledDeckOrder);
    } else {
      // Advance to next position
      state.deckPositionIndex = (state.deckPositionIndex + 1) % positions.length;

      // Reshuffle when cycling back to start
      if (state.deckPositionIndex === 0) {
        state.shuffledDeckOrder = shuffle([...Array(deckSize).keys()]);
        console.log("Deck exhausted - reshuffled:", state.shuffledDeckOrder);
      }
    }

    // Get 3 consecutive cards from shuffled deck
    const startPos = positions[state.deckPositionIndex];
    const order = state.shuffledDeckOrder;
    const indices = [
      order[startPos % deckSize],
      order[(startPos + 1) % deckSize],
      order[(startPos + 2) % deckSize]
    ];

    console.log(`Level ${level} | Position ${state.deckPositionIndex} | Cards: ${indices.join(', ')}`);

    // Shuffle symbols within each card
    const cards = indices.map(idx => shuffle(state.deck[idx]));

    // Find common symbol (the answer)
    const answer = cards[0].find(s => cards[1].includes(s) && cards[2].includes(s));
    console.log("Answer:", answer);

    // Anti-cheat: the client only ever sees opaque per-round, per-slot tokens, never symbol names.
    // The same symbol gets a different token on each card, so the answer can't be found by set intersection.
    const tokens = {};
    const tokenCards = cards.map(card => card.map(sym => { const t = crypto.randomUUID().slice(0, 8); tokens[t] = sym; return t; }));

    // Update state
    state.currentDeckIndices = indices;
    state.currentAnswer = answer;
    state.currentShuffledCards = cards;
    state.currentTokenCards = tokenCards; // what late joiners and returning players get
    state.roundTokens = tokens;
    state.status = "playing";

    // Broadcast new round
    this.broadcast(createPayload("NEW_ROUND", state, {
      cards: tokenCards,
      level,
      gameStartTime: state.gameStartTime
    }));

    await this.storage.put("gamestate", state);
  }

  // ---------------------------------------------------------------------------
  // GAME LIFECYCLE
  // ---------------------------------------------------------------------------

  /**
   * Start a new game (called after countdown in multiplayer)
   */
  async startGame(state, isMultiplayer) {
    // Verify countdown wasn't interrupted (multiplayer only)
    if (isMultiplayer && state.status !== "countdown") {
      console.log("Countdown interrupted, not starting");
      return;
    }

    // Initialize game timing
    state.gameStartTime = Date.now();
    state.gameEndsAt = Date.now() + GAME_DURATION_MS;
    state.countdownStartAt = null;

    // Capture previous scores for level calculations
    const previousScores = { ...state.scores };
    const playerIds = Object.keys(previousScores);

    // Reset all scores to 0
    state.scores = Object.fromEntries(playerIds.map(id => [id, 0]));

    // Determine starting level based on qualifications
    const qualifications = state.qualifiedForLevel || {};
    const currentLevels = state.playerLevels || {};
    let startingLevel = 1;

    for (const pid of playerIds) {
      const level = currentLevels[pid] || 1;
      const prevScore = previousScores[pid] || 0;

      if (qualifications[pid] === 2) {
        startingLevel = 2;
        console.log(`Player ${pid} starting at Level 2 (qualified)`);
        break;
      } else if (level === 2 && prevScore > LEVEL_DOWN_THRESHOLD) {
        startingLevel = 2;
        console.log(`Player ${pid} continuing at Level 2 (scored ${prevScore})`);
        break;
      }
    }

    // Update player levels
    state.playerLevels = Object.fromEntries(
      playerIds.map(id => {
        const level = currentLevels[id] || 1;
        const prevScore = previousScores[id] || 0;

        if (qualifications[id] === 2) return [id, 2];
        if (level === 2 && prevScore <= LEVEL_DOWN_THRESHOLD) return [id, 1];
        return [id, level];
      })
    );

    state.currentLevel = startingLevel;
    state.qualifiedForLevel = {};

    // Reset deck and generate for starting level
    state.deckPositionIndex = null;
    state.shuffledDeckOrder = null;
    const deckData = generateDeck(startingLevel);
    state.deck = deckData.cards;
    state.symbolSet = deckData.symbolSet;

    console.log(`New game - Level ${startingLevel}`);

    await this.startNewRound(state);

    // Schedule game end check for multiplayer
    if (isMultiplayer) {
      this.scheduleGameEndCheck(state.gameStartTime);
    }
  }

  /**
   * Schedule periodic checks for game end (multiplayer only)
   */
  scheduleGameEndCheck(gameStartTime) {
    const check = async () => {
      const state = await this.storage.get("gamestate");

      // Stop if game was reset or different game
      if (!state || state.gameStartTime !== gameStartTime) {
        console.log("Game state changed, stopping end checks");
        return;
      }

      if (state.gameEndsAt && Date.now() >= state.gameEndsAt) {
        await this.endGame(state);
      } else {
        // Check more frequently as end approaches
        const remaining = state.gameEndsAt - Date.now();
        const delay = remaining > 5000 ? 1000 : 200;
        setTimeout(check, delay);
      }
    };

    // Start checking after 50 seconds
    setTimeout(check, 50000);
  }

  /**
   * End the current game and broadcast results
   */
  async endGame(state) {
    console.log("Game over");

    // Check for level qualifications
    state.qualifiedForLevel = state.qualifiedForLevel || {};
    for (const [pid, score] of Object.entries(state.scores)) {
      const level = state.playerLevels[pid] || 1;
      if (score >= LEVEL_UP_THRESHOLD && level === 1) {
        state.qualifiedForLevel[pid] = 2;
        console.log(`Player ${pid} qualified for Level 2 (scored ${score})`);
      }
    }

    state.gameStartTime = null;
    state.gameEndsAt = null;
    state.status = "waiting";

    await this.storage.put("gamestate", state);

    this.broadcast(createPayload("GAME_OVER", state, {
      qualifiedForLevel: state.qualifiedForLevel
    }));
  }

  // ---------------------------------------------------------------------------
  // CONNECTION HANDLERS
  // ---------------------------------------------------------------------------

  /**
   * GET .../s/<token> → the PNG for that token in the current round (never the symbol name).
   * A random-length tEXt chunk is added so the file size doesn't fingerprint the symbol either.
   */
  async onRequest(req) {
    const token = new URL(req.url).pathname.match(/\/s\/([a-f0-9]{8})$/)?.[1];
    const state = token && await this.storage.get("gamestate");
    const name = state?.roundTokens?.[token];
    if (!name) return new Response("not found", { status: 404 });
    const origin = this.env?.ASSET_ORIGIN || DEFAULT_ASSET_ORIGIN;
    if (!pngCache.has(name)) pngCache.set(name, fetch(`${origin}/assets/symbols/${name}.png`).then(r => r.arrayBuffer()));
    const png = new Uint8Array(await pngCache.get(name));
    const pad = crypto.getRandomValues(new Uint8Array(5 + Math.floor(Math.random() * 4000)));
    const body = new Uint8Array(png.length + pad.length + 12);
    const len = png.length - 12; // IEND is the last 12 bytes; splice the padding chunk before it
    body.set(png.subarray(0, len));
    new DataView(body.buffer).setUint32(len, pad.length);
    body.set([0x74, 0x45, 0x58, 0x74], len + 4); // "tEXt"
    body.set(pad, len + 8);
    new DataView(body.buffer).setUint32(len + 8 + pad.length, crc32(body.subarray(len + 4, len + 8 + pad.length)));
    body.set(png.subarray(len), len + 12 + pad.length);
    return new Response(body, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  }

  async onConnect(conn, { request }) {
    // Extract player ID from query params or use connection ID
    const playerId = new URL(request.url).searchParams.get('playerId') || conn.id;
    conn.playerId = playerId;

    // Generate session token for security
    conn.sessionToken = crypto.randomUUID();
    conn.lastGuessTime = 0;

    console.log(`Player connected: ${playerId}`);

    // Get or create game state
    let state = await this.storage.get("gamestate");
    if (!state) {
      state = this.createInitialState(playerId);
      await this.storage.put("gamestate", state);
    }

    state = this.migrateState(state, playerId);

    // Clean up disconnected players
    const activeIds = [...this.getConnections()]
      .map(c => c.playerId)
      .filter(Boolean);

    // A player with no socket is a zombie unless they dropped within the grace window
    const now = Date.now();
    const zombies = Object.keys(state.scores)
      .filter(id => !activeIds.includes(id) && id !== playerId)
      .filter(id => !(state.away[id] && now - state.away[id] < RECONNECT_GRACE_MS));

    if (zombies.length > 0) {
      console.log("Cleaning zombies:", zombies);
      zombies.forEach(id => this.removePlayer(state, id));
      await this.storage.put("gamestate", state);
    }

    // Returning within the grace window: keep seat and score. Past it (e.g. the
    // in-memory cleanup timer died with a server restart), start over as a new player.
    if (state.away[playerId]) {
      if (now - state.away[playerId] < RECONNECT_GRACE_MS) {
        console.log(`Player ${playerId} is back`);
        delete state.away[playerId];
      } else {
        console.log(`Player ${playerId} returned after the grace window, rejoining fresh`);
        this.removePlayer(state, playerId);
      }
      await this.storage.put("gamestate", state);
    }

    // The host must be someone in the room (a departed host can leave a stale id behind)
    if (state.hostId && state.scores[state.hostId] === undefined) {
      state.hostId = Object.keys(state.scores).sort()[0] || playerId;
      console.log(`Stale host replaced by: ${state.hostId}`);
      await this.storage.put("gamestate", state);
    }

    // Check room capacity
    const isNewPlayer = state.scores[playerId] === undefined;
    if (isNewPlayer && Object.keys(state.scores).length >= MAX_PLAYERS) {
      console.log("Room full, rejecting:", playerId);
      conn.send(JSON.stringify({
        type: "ROOM_FULL",
        message: "Room is full (max 5 players)"
      }));
      conn.close();
      return;
    }

    // Reset expired game
    if (state.gameStartTime) {
      const elapsed = (Date.now() - state.gameStartTime) / 1000;
      if (elapsed >= 60) {
        console.log("Resetting expired game");
        state.gameStartTime = null;
        state.status = "waiting";
        await this.storage.put("gamestate", state);
      }
    }

    // Reset stale countdown
    if (state.status === "countdown") {
      const age = state.countdownStartAt ? Date.now() - state.countdownStartAt : null;
      const isStale = !age || age > 5000;

      if (isStale || Object.keys(state.scores).length <= 1) {
        console.log("Resetting stale countdown");
        state.status = "waiting";
        state.countdownStartAt = null;
        await this.storage.put("gamestate", state);
      }
    }

    // Add new player
    if (isNewPlayer) {
      state.scores[playerId] = 0;
      state.playerLevels[playerId] = 1;

      this.broadcast(createPayload("UPDATE_SCORES", state));
      await this.storage.put("gamestate", state);
    }

    // Send session token
    conn.send(JSON.stringify({
      type: "SESSION",
      sessionToken: conn.sessionToken
    }));

    // Send appropriate state based on game status
    const playerCount = Object.keys(state.scores).length;

    if (state.status === "countdown") {
      conn.send(createPayload("GAME_STARTING", state, { countdown: 3 }));
    } else if (state.status === "playing" && state.currentTokenCards) {
      // Player joining mid-game can immediately play (tokens, never symbol names)
      conn.send(createPayload("NEW_ROUND", state, {
        cards: state.currentTokenCards,
        level: state.currentLevel,
        gameStartTime: state.gameStartTime
      }));
    } else {
      conn.send(createPayload("UPDATE_SCORES", state));
    }
  }

  async onClose(conn) {
    const playerId = conn.playerId;
    if (!playerId) return;

    console.log(`Player disconnected: ${playerId}`);

    const state = await this.storage.get("gamestate");
    if (!state) return;

    // Check for other connections from same player
    const otherConns = [...this.getConnections()]
      .filter(c => c.playerId === playerId && c.id !== conn.id);

    if (otherConns.length > 0) {
      console.log(`Player ${playerId} still has ${otherConns.length} connection(s)`);
      return;
    }

    // Keep the seat for a while: iOS drops the socket whenever the screen locks
    const droppedAt = Date.now();
    state.away[playerId] = droppedAt;
    console.log(`Player ${playerId} away, grace ${RECONNECT_GRACE_MS}ms`);
    this.broadcast(createPayload("UPDATE_SCORES", state));
    await this.storage.put("gamestate", state);

    setTimeout(() => {
      this._queue = this._queue.then(async () => {
        const current = await this.storage.get("gamestate");
        if (!current || current.away?.[playerId] !== droppedAt) return; // came back, or a newer drop
        const stillGone = ![...this.getConnections()].some(c => c.playerId === playerId);
        if (!stillGone) { delete current.away[playerId]; }
        else {
          console.log(`Grace over, removing ${playerId}`);
          this.removePlayer(current, playerId);
          if (Object.keys(current.scores).length === 0 && current.status === "countdown") {
            current.status = "waiting";
            current.countdownStartAt = null;
          }
        }
        this.broadcast(createPayload("UPDATE_SCORES", current));
        await this.storage.put("gamestate", current);
      }).catch(console.error);
    }, RECONNECT_GRACE_MS);
  }

  /**
   * Drop a player from the room; hands the host role on if needed
   */
  removePlayer(state, playerId) {
    delete state.scores[playerId];
    delete state.avatars[playerId];
    delete state.playerLevels[playerId];
    delete state.away[playerId];
    const remaining = Object.keys(state.scores);
    if (state.hostId === playerId) {
      state.hostId = remaining.sort()[0] || null; // null: the next player to connect becomes host
      console.log(`Host transferred to: ${state.hostId}`);
    }
  }

  // ---------------------------------------------------------------------------
  // MESSAGE HANDLERS
  // ---------------------------------------------------------------------------

  async onMessage(sender, message) {
    // Queue messages for sequential processing
    this._queue = this._queue
      .then(() => this._handleMessage(message, sender))
      .catch(console.error);
  }

  async _handleMessage(message, sender) {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      console.log("Invalid JSON:", message);
      return;
    }

    const state = await this.storage.get("gamestate");
    const playerCount = Object.keys(state.scores).length;
    const isSinglePlayer = playerCount === 1;
    const isMultiplayer = playerCount > 1;

    switch (data.type) {
      case "START_GAME":
        // Between games only the host starts; mid-game anyone may nudge the next round (watchdog)
        if (isMultiplayer && state.status === "waiting" && !state.gameStartTime && sender.playerId !== state.hostId) {
          console.log("START_GAME ignored, not host:", sender.playerId);
          break;
        }
        await this.handleStartGame(state, data, isMultiplayer);
        break;

      case "END_GAME":
        // Any player can trigger game end when timer reaches zero
        if (state.gameStartTime) {
          console.log("Game ended by player request");
          await this.endGame(state);
        }
        break;

      case "RESET_GAME":
        await this.handleResetGame(state);
        break;

      case "GUESS":
        await this.handleGuess(state, data, sender, isSinglePlayer);
        break;

      case "GET_SCORES":
        sender.send(createPayload("UPDATE_SCORES", state));
        break;

      case "UPDATE_AVATAR":
        state.avatars[sender.playerId] = data.avatar;
        this.broadcast(createPayload("UPDATE_SCORES", state));
        await this.storage.put("gamestate", state);
        break;
    }
  }

  async handleStartGame(state, data, isMultiplayer) {
    console.log("START_GAME", data.skipLevelUp ? "(skip level up)" : "");

    const isNewGame = !state.gameStartTime || state.status === "waiting";

    if (!isNewGame) {
      // Mid-game: just start next round
      await this.startNewRound(state);
      return;
    }

    // Check for stale countdown
    if (state.status === "countdown") {
      const age = state.countdownStartAt ? Date.now() - state.countdownStartAt : null;
      if (age && age <= 5000) {
        console.log("Countdown in progress, ignoring");
        return;
      }
      state.status = "waiting";
      state.countdownStartAt = null;
    }

    // Handle skip level up request
    if (data.skipLevelUp) {
      console.log("Skipping level up - resetting to level 1");
      state.qualifiedForLevel = {};
      for (const pid of Object.keys(state.playerLevels || {})) {
        state.playerLevels[pid] = 1;
      }
      state.currentLevel = 1;
      await this.storage.put("gamestate", state);
    }

    if (isMultiplayer) {
      // Start countdown
      state.status = "countdown";
      state.countdownStartAt = Date.now();
      await this.storage.put("gamestate", state);

      this.broadcast(createPayload("GAME_STARTING", state, { countdown: 3 }));

      // Start game after countdown
      setTimeout(async () => {
        const currentState = await this.storage.get("gamestate");
        await this.startGame(currentState, true);
      }, COUNTDOWN_DURATION_MS);
    } else {
      // Single player starts immediately
      console.log("Single player - starting immediately");
      await this.startGame(state, false);
    }
  }

  async handleResetGame(state) {
    // Reset all scores and levels
    state.scores = Object.fromEntries(
      Object.keys(state.scores).map(id => [id, 0])
    );
    state.playerLevels = Object.fromEntries(
      Object.keys(state.playerLevels).map(id => [id, 1])
    );
    state.currentLevel = 1;
    state.gameStartTime = null;
    state.status = "waiting";

    this.broadcast(createPayload("GAME_RESET", state));
    await this.storage.put("gamestate", state);
  }

  async handleGuess(state, data, sender, isSinglePlayer) {
    if (state.status !== "playing") return;

    // Validate session
    if (data.sessionToken !== sender.sessionToken) {
      console.log("Invalid session from", sender.playerId);
      return;
    }

    // Rate limit
    const now = Date.now();
    if (now - sender.lastGuessTime < GUESS_RATE_LIMIT_MS) {
      console.log("Rate limited:", sender.playerId);
      return;
    }
    sender.lastGuessTime = now;

    if (sender.lockedUntil && now < sender.lockedUntil) {
      console.log("Locked out after a miss:", sender.playerId);
      return;
    }

    // Check if game expired
    if (state.gameEndsAt && now > state.gameEndsAt) {
      console.log("Guess after game ended");
      await this.endGame(state);
      return;
    }

    const guesser = sender.playerId;
    const guessedSymbol = state.roundTokens?.[data.token];
    const isCorrect = guessedSymbol !== undefined && guessedSymbol === state.currentAnswer;
    const delay = isSinglePlayer ? SINGLE_PLAYER_DELAY : MULTI_PLAYER_DELAY;

    console.log(`${guesser} guessed ${guessedSymbol} (${data.token}) | Answer: ${state.currentAnswer} | ${isCorrect ? 'CORRECT' : 'WRONG'}`);

    if (isCorrect) {
      state.status = "waiting";
      // Update score
      const newScore = (state.scores[guesser] || 0) + 1;
      state.scores[guesser] = newScore;

      // Check level qualification
      const level = state.playerLevels[guesser] || 1;
      if (newScore >= LEVEL_UP_THRESHOLD && level === 1) {
        state.qualifiedForLevel = state.qualifiedForLevel || {};
        state.qualifiedForLevel[guesser] = 2;
        console.log(`${guesser} qualified for Level 2`);
      }

      this.broadcast(createPayload("WINNER", state, {
        winnerId: guesser,
        winningTokens: Object.keys(state.roundTokens).filter(t => state.roundTokens[t] === state.currentAnswer)
      }));
    } else {
      // Wrong answer - decrease score if positive
      const oldScore = state.scores[guesser] || 0;
      let newScore = oldScore;
      let levelChanged = false;
      let newLevel = state.playerLevels[guesser] || 1;

      if (oldScore > 0) {
        newScore = oldScore - 1;
        state.scores[guesser] = newScore;
      }

      // Check for level down (single player on level 2 only)
      if (isSinglePlayer && newLevel === 2 && newScore <= LEVEL_DOWN_THRESHOLD) {
        newLevel = 1;
        state.playerLevels[guesser] = 1;
        levelChanged = true;
        console.log(`${guesser} dropped to Level 1`);

        state = await this.switchLevel(state, 1);

        if (state.qualifiedForLevel) {
          delete state.qualifiedForLevel[guesser];
        }
      }

      // A miss costs only the tapper: a short lockout, and the round goes on for everyone
      sender.lockedUntil = now + MISS_LOCKOUT_MS;

      this.broadcast(createPayload("WRONG_GUESS", state, {
        guesserId: guesser,
        lockoutMs: MISS_LOCKOUT_MS,
        levelChanged,
        newLevel: levelChanged ? newLevel : undefined
      }));

      if (!levelChanged) {
        await this.storage.put("gamestate", state);
        return;
      }
      // Level dropped: the deck changed, so deal a fresh round
      state.status = "waiting";
    }

    // Extend game time to account for pause
    if (state.gameEndsAt) {
      state.gameEndsAt += delay;
    }

    await this.storage.put("gamestate", state);

    // Schedule next round
    setTimeout(async () => {
      const currentState = await this.storage.get("gamestate");
      await this.startNewRound(currentState);
    }, delay);
  }
}

// =============================================================================
// WORKER ENTRY
// =============================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Older clients (and the tvOS app) connect to /party/<room>; PartyServer routes /parties/main/<room>
    if (url.pathname.startsWith("/party/")) {
      url.pathname = url.pathname.replace("/party/", "/parties/main/");
      request = new Request(url, request);
    }
    return (await routePartykitRequest(request, env)) || new Response("Not found", { status: 404 });
  }
};
