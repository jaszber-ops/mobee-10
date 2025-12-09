// party/server.js
import { generateDeck } from "./game-math.js";

export default class MobeeServer {
  constructor(party) {
    this.party = party;
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

    if (!state.scores[playerId]) {
      state.scores[playerId] = 0;
      await this.party.storage.put("gamestate", state);
    }

    conn.send(JSON.stringify({
      type: "UPDATE_SCORES",
      scores: state.scores,
      avatars: state.avatars
    }));
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
      state.status = "playing";

      // Start game timer on first round (and reset scores)
      if (!state.gameStartTime) {
        state.gameStartTime = Date.now();
        console.log("Game timer started!");

        // Reset all scores to 0 at game start
        state.scores = Object.fromEntries(
          Object.keys(state.scores).map(id => [id, 0])
        );
      }

      const idx = [0,1,2,3,4,5,6,7].sort(() => Math.random() - 0.5).slice(0, 3);

      const c1 = state.deck[idx[0]];
      const c2 = state.deck[idx[1]];
      const c3 = state.deck[idx[2]];

      const answer = c1.find(s => c2.includes(s) && c3.includes(s));
      state.currentAnswer = answer;

      // Shuffle symbols within each card so matching symbol isn't always in same position
      const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

      this.party.broadcast(JSON.stringify({
        type: "NEW_ROUND",
        cards: [shuffleArray(c1), shuffleArray(c2), shuffleArray(c3)],
        gameStartTime: state.gameStartTime,
        scores: state.scores,
        avatars: state.avatars
      }));

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

      if (data.symbol === state.currentAnswer) {
        // Correct answer - winner!
        console.log("Winner:", guesser);
        state.status = "waiting";
        state.scores[guesser] = (state.scores[guesser] || 0) + 1;

        this.party.broadcast(JSON.stringify({
          type: "WINNER",
          winnerId: guesser,
          scores: state.scores,
          avatars: state.avatars
        }));

        await this.party.storage.put("gamestate", state);

        // Auto-start next round after 4 seconds (1s winner msg + 3s countdown)
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");

          // Generate new round
          const idx = [0,1,2,3,4,5,6,7].sort(() => Math.random() - 0.5).slice(0, 3);
          const c1 = currentState.deck[idx[0]];
          const c2 = currentState.deck[idx[1]];
          const c3 = currentState.deck[idx[2]];
          const answer = c1.find(s => c2.includes(s) && c3.includes(s));

          currentState.currentAnswer = answer;
          currentState.status = "playing";

          const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

          this.party.broadcast(JSON.stringify({
            type: "NEW_ROUND",
            cards: [shuffleArray(c1), shuffleArray(c2), shuffleArray(c3)],
            gameStartTime: currentState.gameStartTime,
            scores: currentState.scores,
            avatars: currentState.avatars
          }));

          await this.party.storage.put("gamestate", currentState);
        }, 4000);
      } else {
        // Wrong answer - opponent(s) win!
        console.log("Wrong guess from:", guesser);
        state.status = "waiting";

        // Award point to all other players
        const allPlayerIds = Object.keys(state.scores);
        allPlayerIds.forEach(playerId => {
          if (playerId !== guesser) {
            state.scores[playerId] = (state.scores[playerId] || 0) + 1;
          }
        });

        // Broadcast that the guesser lost (opponents win)
        this.party.broadcast(JSON.stringify({
          type: "WRONG_GUESS",
          guesserId: guesser,
          scores: state.scores,
          avatars: state.avatars
        }));

        await this.party.storage.put("gamestate", state);

        // Auto-start next round after 4 seconds (1s wrong msg + 3s countdown)
        setTimeout(async () => {
          const currentState = await this.party.storage.get("gamestate");

          // Generate new round
          const idx = [0,1,2,3,4,5,6,7].sort(() => Math.random() - 0.5).slice(0, 3);
          const c1 = currentState.deck[idx[0]];
          const c2 = currentState.deck[idx[1]];
          const c3 = currentState.deck[idx[2]];
          const answer = c1.find(s => c2.includes(s) && c3.includes(s));

          currentState.currentAnswer = answer;
          currentState.status = "playing";

          const shuffleArray = (arr) => [...arr].sort(() => Math.random() - 0.5);

          this.party.broadcast(JSON.stringify({
            type: "NEW_ROUND",
            cards: [shuffleArray(c1), shuffleArray(c2), shuffleArray(c3)],
            gameStartTime: currentState.gameStartTime,
            scores: currentState.scores,
            avatars: currentState.avatars
          }));

          await this.party.storage.put("gamestate", currentState);
        }, 4000);
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
}
