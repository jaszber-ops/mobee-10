/**
 * Møbee Multi - PartyKit Server
 *
 * Real-time multiplayer game server handling:
 * - Player connections and disconnections
 * - Game state management (rounds, scores, levels)
 * - Guess validation and scoring
 * - Session security and rate limiting
 */

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
const SINGLE_PLAYER_DELAY = 300;  // Delay between rounds (single player)
const MULTI_PLAYER_DELAY = 4000;  // Delay between rounds (multiplayer)

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
    ...extra
  });
}

// =============================================================================
// MAIN SERVER CLASS
// =============================================================================

export default class MobeeServer {
  constructor(party) {
    this.party = party;
    // Message queue ensures sequential processing of async operations
    this._queue = Promise.resolve();
  }

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

    // Update state
    state.currentDeckIndices = indices;
    state.currentAnswer = answer;
    state.currentShuffledCards = cards;
    state.status = "playing";

    // Broadcast new round
    this.party.broadcast(createPayload("NEW_ROUND", state, {
      cards,
      level,
      gameStartTime: state.gameStartTime
    }));

    await this.party.storage.put("gamestate", state);
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
      const state = await this.party.storage.get("gamestate");

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

    await this.party.storage.put("gamestate", state);

    this.party.broadcast(createPayload("GAME_OVER", state, {
      qualifiedForLevel: state.qualifiedForLevel
    }));
  }

  // ---------------------------------------------------------------------------
  // CONNECTION HANDLERS
  // ---------------------------------------------------------------------------

  async onConnect(conn) {
    // Extract player ID from query params or use connection ID
    const playerId = new URL(conn.uri).searchParams.get('playerId') || conn.id;
    conn.playerId = playerId;

    // Generate session token for security
    conn.sessionToken = crypto.randomUUID();
    conn.lastGuessTime = 0;

    console.log(`Player connected: ${playerId}`);

    // Get or create game state
    let state = await this.party.storage.get("gamestate");
    if (!state) {
      state = this.createInitialState(playerId);
      await this.party.storage.put("gamestate", state);
    }

    state = this.migrateState(state, playerId);

    // Clean up disconnected players
    const activeIds = [...this.party.getConnections()]
      .map(c => c.playerId)
      .filter(Boolean);

    const zombies = Object.keys(state.scores)
      .filter(id => !activeIds.includes(id) && id !== playerId);

    if (zombies.length > 0) {
      console.log("Cleaning zombies:", zombies);
      zombies.forEach(id => {
        delete state.scores[id];
        delete state.avatars[id];
        delete state.playerLevels[id];
      });
      await this.party.storage.put("gamestate", state);
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
        await this.party.storage.put("gamestate", state);
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
        await this.party.storage.put("gamestate", state);
      }
    }

    // Add new player
    if (isNewPlayer) {
      state.scores[playerId] = 0;
      state.playerLevels[playerId] = 1;

      this.party.broadcast(createPayload("UPDATE_SCORES", state));
      await this.party.storage.put("gamestate", state);
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
    } else if (state.status === "playing" && state.currentShuffledCards) {
      // Player joining mid-game can immediately play
      conn.send(createPayload("NEW_ROUND", state, {
        cards: state.currentShuffledCards,
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

    const state = await this.party.storage.get("gamestate");
    if (!state) return;

    // Check for other connections from same player
    const otherConns = [...this.party.getConnections()]
      .filter(c => c.playerId === playerId && c.id !== conn.id);

    if (otherConns.length > 0) {
      console.log(`Player ${playerId} still has ${otherConns.length} connection(s)`);
      return;
    }

    // Remove player
    delete state.scores[playerId];
    delete state.avatars[playerId];
    delete state.playerLevels[playerId];

    const remaining = Object.keys(state.scores).length;
    console.log(`Removed player. Remaining: ${remaining}`);

    // Transfer host if needed
    if (state.hostId === playerId && remaining > 0) {
      state.hostId = Object.keys(state.scores).sort()[0];
      console.log(`Host transferred to: ${state.hostId}`);
    }

    // Cancel countdown if no players
    if (remaining === 0 && state.status === "countdown") {
      state.status = "waiting";
      state.countdownStartAt = null;
    }

    this.party.broadcast(createPayload("UPDATE_SCORES", state));
    await this.party.storage.put("gamestate", state);
  }

  // ---------------------------------------------------------------------------
  // MESSAGE HANDLERS
  // ---------------------------------------------------------------------------

  async onMessage(message, sender) {
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

    const state = await this.party.storage.get("gamestate");
    const playerCount = Object.keys(state.scores).length;
    const isSinglePlayer = playerCount === 1;
    const isMultiplayer = playerCount > 1;

    switch (data.type) {
      case "START_GAME":
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
        this.party.broadcast(createPayload("UPDATE_SCORES", state));
        await this.party.storage.put("gamestate", state);
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
      await this.party.storage.put("gamestate", state);
    }

    if (isMultiplayer) {
      // Start countdown
      state.status = "countdown";
      state.countdownStartAt = Date.now();
      await this.party.storage.put("gamestate", state);

      this.party.broadcast(createPayload("GAME_STARTING", state, { countdown: 3 }));

      // Start game after countdown
      setTimeout(async () => {
        const currentState = await this.party.storage.get("gamestate");
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

    this.party.broadcast(createPayload("GAME_RESET", state));
    await this.party.storage.put("gamestate", state);
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

    // Check if game expired
    if (state.gameEndsAt && now > state.gameEndsAt) {
      console.log("Guess after game ended");
      await this.endGame(state);
      return;
    }

    const guesser = sender.playerId;
    const isCorrect = data.symbol === state.currentAnswer;
    const delay = isSinglePlayer ? SINGLE_PLAYER_DELAY : MULTI_PLAYER_DELAY;

    console.log(`${guesser} guessed ${data.symbol} | Answer: ${state.currentAnswer} | ${isCorrect ? 'CORRECT' : 'WRONG'}`);

    state.status = "waiting";

    if (isCorrect) {
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

      this.party.broadcast(createPayload("WINNER", state, {
        winnerId: guesser,
        winningSymbol: state.currentAnswer
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

      this.party.broadcast(createPayload("WRONG_GUESS", state, {
        guesserId: guesser,
        levelChanged,
        newLevel: levelChanged ? newLevel : undefined
      }));
    }

    // Extend game time to account for pause
    if (state.gameEndsAt) {
      state.gameEndsAt += delay;
    }

    await this.party.storage.put("gamestate", state);

    // Schedule next round
    setTimeout(async () => {
      const currentState = await this.party.storage.get("gamestate");
      await this.startNewRound(currentState);
    }, delay);
  }
}
