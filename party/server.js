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
  }

  // Helper method to generate and broadcast a new round
  // If replaceCardIndex is provided, only replace that card
  async startNewRound(state, replaceCardIndex = null) {
    const shuffleArray = (arr) => fisherYatesShuffle(arr);

    let c1, c2, c3;

    if (replaceCardIndex !== null && state.currentShuffledCards && state.currentDeckIndices) {
      // Replace only the specified card, keep others with their exact shuffle
      console.log("Current deck indices:", state.currentDeckIndices);
      console.log("Replacing card index:", replaceCardIndex);

      // Get the deck indices currently in use
      const usedIndices = state.currentDeckIndices.filter((_, i) => i !== replaceCardIndex);

      // Get available indices (exclude the ones currently in use)
      const availableIndices = [0,1,2,3,4,5,6,7].filter(idx => !usedIndices.includes(idx));

      console.log("Used deck indices:", usedIndices);
      console.log("Available deck indices:", availableIndices);

      if (availableIndices.length === 0) {
        console.error("ERROR: No available indices! This shouldn't happen.");
        // Fallback - use all indices
        availableIndices.push(...[0,1,2,3,4,5,6,7]);
      }

      // Pick a random card from available indices
      const shuffledAvailable = fisherYatesShuffle(availableIndices);
      const newCardIndex = shuffledAvailable[0];
      const newCard = shuffleArray(state.deck[newCardIndex]);

      // Keep the other two cards WITH their existing shuffle
      c1 = replaceCardIndex === 0 ? newCard : state.currentShuffledCards[0];
      c2 = replaceCardIndex === 1 ? newCard : state.currentShuffledCards[1];
      c3 = replaceCardIndex === 2 ? newCard : state.currentShuffledCards[2];

      // Update deck indices
      const newDeckIndices = [...state.currentDeckIndices];
      newDeckIndices[replaceCardIndex] = newCardIndex;
      state.currentDeckIndices = newDeckIndices;

      console.log("✓ Replaced card", replaceCardIndex, "with new card from deck index", newCardIndex);
      console.log("New deck indices:", newDeckIndices);
    } else {
      if (replaceCardIndex !== null) {
        console.log("WARNING: replaceCardIndex provided but missing state data - falling back to 3 new cards");
        console.log("currentShuffledCards:", !!state.currentShuffledCards, "currentDeckIndices:", !!state.currentDeckIndices);
      }
      // Deal 3 new cards (initial round or no previous cards)
      const shuffledIndices = fisherYatesShuffle([0,1,2,3,4,5,6,7]);
      const idx = shuffledIndices.slice(0, 3);
      c1 = shuffleArray(state.deck[idx[0]]);
      c2 = shuffleArray(state.deck[idx[1]]);
      c3 = shuffleArray(state.deck[idx[2]]);

      // Store which deck indices we used
      state.currentDeckIndices = [idx[0], idx[1], idx[2]];
    }

    const answer = c1.find(s => c2.includes(s) && c3.includes(s));

    console.log("Common symbol (answer):", answer);

    state.currentAnswer = answer;
    state.currentShuffledCards = [c1, c2, c3]; // Store current SHUFFLED cards for next round
    state.status = "playing";

    this.party.broadcast(JSON.stringify({
      type: "NEW_ROUND",
      cards: [c1, c2, c3], // Already shuffled, don't shuffle again
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
    // Only spectate if: (1) game is playing AND (2) this is a NEW player joining mid-game AND (3) there are other players
    const playerCount = Object.keys(state.scores).length;
    const shouldSpectate = state.status === "playing" && state.currentShuffledCards && !isReturningPlayer && playerCount > 1;

    if (shouldSpectate) {
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
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log("Invalid JSON message:", message);
      return;
    }

    let state = await this.party.storage.get("gamestate");

    if (data.type === "START_GAME") {
      console.log("Starting new round...");

      // If we're starting from lobby (status is waiting), always start a fresh 60-second game
      const isNewGame = !state.gameStartTime || state.status === "waiting";

      if (isNewGame) {
        state.gameStartTime = Date.now();
        console.log("Game timer started fresh at 60 seconds!");

        // Reset all scores to 0 at game start
        state.scores = Object.fromEntries(
          Object.keys(state.scores).map(id => [id, 0])
        );
      }

      await this.startNewRound(state);
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
          scores: state.scores,
          avatars: state.avatars
        }));

        await this.party.storage.put("gamestate", state);

        // Check if single player mode
        const playerCount = Object.keys(state.scores).length;
        const delay = playerCount === 1 ? 300 : 4000; // 300ms for single player, 4s for multiplayer

        // Auto-start next round, replacing only the clicked card
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");
          await this.startNewRound(currentState, data.cardIndex);
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

        // Auto-start next round - deal 3 new cards on wrong guess
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");
          await this.startNewRound(currentState, null);
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
