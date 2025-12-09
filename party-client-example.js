// Example: How to integrate PartyKit into your Mobee game
// This file shows you how to connect to the PartyKit server

import PartySocket from "partysocket";

// Initialize PartyKit connection
const roomId = "game-" + Math.random().toString(36).substring(7); // Or use a specific room ID

const partySocket = new PartySocket({
  host: "localhost:1999", // Use this for local development
  // host: "your-project.username.partykit.dev", // Use this for production
  room: roomId
});

// Handle connection events
partySocket.addEventListener("open", () => {
  console.log("Connected to game room:", roomId);
});

partySocket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "player-joined":
      console.log("Player joined:", data.playerId);
      // Update UI to show new player
      break;

    case "player-left":
      console.log("Player left:", data.playerId);
      // Update UI to remove player
      break;

    case "card-flip":
      console.log("Card flipped by player:", data.playerId, data.cardIndex);
      // Update game state to show flipped card
      break;

    case "match-found":
      console.log("Match found by player:", data.playerId, data.cards);
      // Update game state to show matched cards
      break;

    case "game-state":
      console.log("Game state updated:", data.state);
      // Sync your local game state
      break;
  }
});

partySocket.addEventListener("error", (error) => {
  console.error("PartyKit error:", error);
});

partySocket.addEventListener("close", () => {
  console.log("Disconnected from game room");
});

// Send messages to the server
function sendCardFlip(cardIndex) {
  partySocket.send(JSON.stringify({
    type: "card-flip",
    cardIndex: cardIndex
  }));
}

function sendMatchFound(cards) {
  partySocket.send(JSON.stringify({
    type: "match-found",
    cards: cards
  }));
}

function sendGameState(state) {
  partySocket.send(JSON.stringify({
    type: "game-state",
    state: state
  }));
}

// Export functions for use in your game
export { partySocket, sendCardFlip, sendMatchFound, sendGameState, roomId };
