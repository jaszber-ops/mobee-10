// party/server.js
import { generateDeck } from "./game-math.js";

// Fisher-Yates shuffle for unbiased random selection
function fisherYatesShuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default class MobeeServer {
  constructor(party) {
    this.party = party;
    this._queue = Promise.resolve();
  }

  // Helper method to generate and broadcast a new round
  // Deck cycles through positions: 0,3,6,1,4,7,2,5 then reshuffles
  async startNewRound(state) {
    const shuffleArray = (arr) => fisherYatesShuffle(arr);

    // The 8 starting positions that cycle through all unique 3-card combinations
    const DECK_POSITIONS = [0, 3, 6, 1, 4, 7, 2, 5];

    // Initialize or advance deck position
    if (state.deckPositionIndex === undefined || state.deckPositionIndex === null) {
      // First round - shuffle deck order and start at position 0
      state.shuffledDeckOrder = fisherYatesShuffle([0, 1, 2, 3, 4, 5, 6, 7]);
      state.deckPositionIndex = 0;
      console.log("New game - shuffled deck order:", state.shuffledDeckOrder);
    } else {
      // Advance to next position
      state.deckPositionIndex = (state.deckPositionIndex + 1) % DECK_POSITIONS.length;

      // If we've cycled back to 0, reshuffle the deck
      if (state.deckPositionIndex === 0) {
        state.shuffledDeckOrder = fisherYatesShuffle([0, 1, 2, 3, 4, 5, 6, 7]);
        console.log("Deck exhausted - reshuffled deck order:", state.shuffledDeckOrder);
      }
    }

    // Get the starting position for this round's 3-card hand
    const startPos = DECK_POSITIONS[state.deckPositionIndex];

    // Get 3 consecutive cards from shuffled deck (wrapping around)
    const deckOrder = state.shuffledDeckOrder;
    const idx1 = deckOrder[startPos % 8];
    const idx2 = deckOrder[(startPos + 1) % 8];
    const idx3 = deckOrder[(startPos + 2) % 8];

    console.log("Position index:", state.deckPositionIndex, "| Start pos:", startPos, "| Card indices:", idx1, idx2, idx3);

    // Shuffle symbols within each card
    const c1 = shuffleArray(state.deck[idx1]);
    const c2 = shuffleArray(state.deck[idx2]);
    const c3 = shuffleArray(state.deck[idx3]);

    // Store which deck indices we used
    state.currentDeckIndices = [idx1, idx2, idx3];

    const answer = c1.find(s => c2.includes(s) && c3.includes(s));

    console.log("Common symbol (answer):", answer);

    state.currentAnswer = answer;
    state.currentShuffledCards = [c1, c2, c3];
    state.status = "playing";

    this.party.broadcast(JSON.stringify({
      type: "NEW_ROUND",
      cards: [c1, c2, c3],
      gameStartTime: state.gameStartTime,
      scores: state.scores,
      avatars: state.avatars
    }));

    await this.party.storage.put("gamestate", state);
  }

  async onConnect(conn) {
    // Extract persistent playerId from query params
    const playerId = new URL(conn.uri).searchParams.get('playerId') || conn.id;

    // Store playerId on connection object for later use
    conn.playerId = playerId;

    console.log("Player connected:", playerId, "(conn:", conn.id + ")");

    let state = await this.party.storage.get("gamestate");

    if (!state) {
      state = {
        deck: generateDeck(),
        status: "waiting",
        scores: {},
        avatars: {},
        currentAnswer: null,
        gameStartTime: null
      };
      await this.party.storage.put("gamestate", state);
    }

    // Initialize avatars object if it doesn't exist (for backwards compatibility)
    if (!state.avatars) {
      state.avatars = {};
    }

    // Clean up zombie players (players in state but no active connection)
    const activePlayerIds = [...this.party.getConnections()].map(c => c.playerId).filter(Boolean);
    const statePlayerIds = Object.keys(state.scores);
    const zombiePlayers = statePlayerIds.filter(id => !activePlayerIds.includes(id) && id !== playerId);

    if (zombiePlayers.length > 0) {
      console.log("Cleaning up zombie players:", zombiePlayers);
      zombiePlayers.forEach(zombieId => {
        delete state.scores[zombieId];
        delete state.avatars[zombieId];
      });
      await this.party.storage.put("gamestate", state);
    }

    // Check player limit (max 5 players)
    const existingPlayerCount = Object.keys(state.scores).length;
    const isNewPlayer = !state.scores[playerId];

    if (isNewPlayer && existingPlayerCount >= 5) {
      console.log("Room full - rejecting player:", playerId);
      conn.send(JSON.stringify({
        type: "ROOM_FULL",
        message: "This room is full (max 5 players). Please try a different room."
      }));
      conn.close();
      return;
    }

    // Reset gameStartTime in these cases:
    // 1. If in lobby (waiting status)
    // 2. If game time has expired (60+ seconds elapsed)
    if (state.gameStartTime) {
      const elapsed = Math.floor((Date.now() - state.gameStartTime) / 1000);

      if (state.status === "waiting" || elapsed >= 60) {
        console.log("Resetting gameStartTime (status:", state.status, "elapsed:", elapsed, "s)");
        state.gameStartTime = null;
        state.status = "waiting";
        await this.party.storage.put("gamestate", state);
      }
    }

    // Check if player was already in the game (returning player vs new player)
    const isReturningPlayer = state.scores[playerId] !== undefined;

    // Add player to scores if new
    if (!isReturningPlayer) {
      state.scores[playerId] = 0;

      // Notify all players about the new player joining
      this.party.broadcast(JSON.stringify({
        type: "UPDATE_SCORES",
        scores: state.scores,
        avatars: state.avatars
      }));

      await this.party.storage.put("gamestate", state);
    }

    // Send current game state to the connecting player
    const playerCount = Object.keys(state.scores).length;

    if (state.status === "countdown") {
      // Game is in countdown - show countdown to joining player too
      console.log("Player joining during countdown");
      conn.send(JSON.stringify({
        type: "GAME_STARTING",
        countdown: 3, // They'll see remaining countdown
        scores: state.scores,
        avatars: state.avatars
      }));
    } else if (state.status === "playing" && state.currentShuffledCards && !isReturningPlayer && playerCount > 1) {
      // New player joining mid-game with other players - send them as spectator
      console.log("New player joining mid-game with", playerCount, "total players - spectating");
      conn.send(JSON.stringify({
        type: "JOIN_AS_SPECTATOR",
        cards: state.currentShuffledCards,
        gameStartTime: state.gameStartTime,
        scores: state.scores,
        avatars: state.avatars
      }));
    } else {
      // Game is in lobby OR returning player OR solo player - show lobby
      if (state.status === "playing" && !isReturningPlayer && playerCount === 1) {
        console.log("Solo player in active game - going to lobby instead of spectating");
      }
      conn.send(JSON.stringify({
        type: "UPDATE_SCORES",
        scores: state.scores,
        avatars: state.avatars
      }));
    }
  }

  async onMessage(message, sender) {
    this._queue = this._queue.then(() => this._handleMessage(message, sender)).catch(console.error);
  }

  async _handleMessage(message, sender) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log("Invalid JSON message:", message);
      return;
    }

    let state = await this.party.storage.get("gamestate");

    if (data.type === "START_GAME") {
      console.log("Starting new game...");

      // If we're starting from lobby (status is waiting), always start a fresh 60-second game
      const isNewGame = !state.gameStartTime || state.status === "waiting";

      if (isNewGame) {
        // Mark that countdown is in progress to prevent multiple starts
        if (state.status === "countdown") {
          console.log("Countdown already in progress, ignoring START_GAME");
          return;
        }

        state.status = "countdown";
        await this.party.storage.put("gamestate", state);

        // Broadcast countdown start to all players
        this.party.broadcast(JSON.stringify({
          type: "GAME_STARTING",
          countdown: 3,
          scores: state.scores,
          avatars: state.avatars
        }));

        // After 3 seconds, actually start the game
        setTimeout(async () => {
          let currentState = await this.party.storage.get("gamestate");

          // Only proceed if still in countdown (game wasn't reset)
          if (currentState.status !== "countdown") {
            console.log("Countdown interrupted, not starting game");
            return;
          }

          currentState.gameStartTime = Date.now();
          console.log("Game timer started fresh at 60 seconds!");

          // Reset all scores to 0 at game start
          currentState.scores = Object.fromEntries(
            Object.keys(currentState.scores).map(id => [id, 0])
          );

          // Reset deck position to start fresh with a new shuffle
          currentState.deckPositionIndex = null;
          currentState.shuffledDeckOrder = null;

          await this.startNewRound(currentState);
        }, 3000);
      } else {
        // Mid-game start (shouldn't normally happen)
        await this.startNewRound(state);
      }
    }

    if (data.type === "END_GAME") {
      // Timer reached 0 - reset gameStartTime so next game starts fresh
      console.log("Game ended - resetting timer");
      state.gameStartTime = null;
      state.status = "waiting";
      await this.party.storage.put("gamestate", state);
    }

    if (data.type === "RESET_GAME") {
      // Reset scores and timer for new game
      state.scores = Object.fromEntries(
        Object.keys(state.scores).map(id => [id, 0])
      );
      state.gameStartTime = null;
      state.status = "waiting";

      this.party.broadcast(JSON.stringify({
        type: "GAME_RESET",
        scores: state.scores,
        avatars: state.avatars
      }));

      await this.party.storage.put("gamestate", state);
    }

    if (data.type === "GUESS") {
      if (state.status !== "playing") return;

      const guesser = sender.playerId;

      console.log("Player", guesser, "guessed symbol:", data.symbol, "| Correct answer:", state.currentAnswer);

      if (data.symbol === state.currentAnswer) {
        // Correct answer - winner!
        console.log("✓ CORRECT! Winner:", guesser, "clicked card:", data.cardIndex);
        state.status = "waiting";
        state.scores[guesser] = (state.scores[guesser] || 0) + 1;

        this.party.broadcast(JSON.stringify({
          type: "WINNER",
          winnerId: guesser,
          winningSymbol: state.currentAnswer,
          scores: state.scores,
          avatars: state.avatars
        }));

        await this.party.storage.put("gamestate", state);

        // Check if single player mode
        const playerCount = Object.keys(state.scores).length;
        const delay = playerCount === 1 ? 300 : 4000; // 300ms for single player, 4s for multiplayer

        // Auto-start next round with new 3-card hand
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");
          await this.startNewRound(currentState);
        }, delay);
      } else {
        // Wrong answer - lose 1 point if positive
        console.log("Wrong guess from:", guesser);
        state.status = "waiting";

        // Decrease guesser's score by 1 if positive
        if (state.scores[guesser] > 0) {
          state.scores[guesser] = state.scores[guesser] - 1;
        }

        // Broadcast that the guesser lost
        this.party.broadcast(JSON.stringify({
          type: "WRONG_GUESS",
          guesserId: guesser,
          scores: state.scores,
          avatars: state.avatars
        }));

        await this.party.storage.put("gamestate", state);

        // Check if single player mode
        const playerCount = Object.keys(state.scores).length;
        const delay = playerCount === 1 ? 300 : 4000; // 300ms for single player, 4s for multiplayer

        // Auto-start next round with new 3-card hand
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");
          await this.startNewRound(currentState);
        }, delay);
      }
    }

    if (data.type === "GET_SCORES") {
      sender.send(JSON.stringify({
        type: "UPDATE_SCORES",
        scores: state.scores,
        avatars: state.avatars
      }));
    }

    if (data.type === "UPDATE_AVATAR") {
      const playerId = sender.playerId;
      state.avatars[playerId] = data.avatar;

      // Broadcast updated avatars to all players
      this.party.broadcast(JSON.stringify({
        type: "UPDATE_SCORES",
        scores: state.scores,
        avatars: state.avatars
      }));

      await this.party.storage.put("gamestate", state);
    }
  }

  async onClose(conn) {
    // Get playerId from the connection
    const playerId = conn.playerId;

    if (!playerId) {
      console.log("Connection closed with no playerId");
      return;
    }

    console.log("Player disconnected:", playerId);

    let state = await this.party.storage.get("gamestate");

    if (!state) return;

    // Remove player from scores and avatars
    if (state.scores && state.scores[playerId] !== undefined) {
      delete state.scores[playerId];
      console.log("Removed player from scores:", playerId);
    }

    if (state.avatars && state.avatars[playerId]) {
      delete state.avatars[playerId];
      console.log("Removed player avatar:", playerId);
    }

    // Save updated state
    await this.party.storage.put("gamestate", state);

    // Notify remaining players about updated scores/avatars
    this.party.broadcast(JSON.stringify({
      type: "UPDATE_SCORES",
      scores: state.scores,
      avatars: state.avatars
    }));

    console.log("Remaining players:", Object.keys(state.scores).length);
  }
}
