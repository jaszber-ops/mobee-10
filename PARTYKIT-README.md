# Mobee Multi - PartyKit Setup

This is the multiplayer version of Mobee game using PartyKit for real-time synchronization.

## What's Been Set Up

1. **PartyKit Server** (`party/server.js`):
   - Handles WebSocket connections
   - Broadcasts card flips to all players
   - Manages player join/leave events
   - Syncs game state across players

2. **Client Example** (`party-client-example.js`):
   - Shows how to connect to PartyKit
   - Example message handlers
   - Functions to send game events

3. **Configuration** (`partykit.json`):
   - PartyKit project configuration

## Development

### Start PartyKit Dev Server
```bash
npm run dev
```

This starts:
- PartyKit server on `localhost:1999`
- You can test WebSocket connections locally

### Test Your Setup
Open your browser console and test the connection:
```javascript
const ws = new WebSocket("ws://localhost:1999/parties/main/test-room");
ws.onmessage = (e) => console.log(e.data);
ws.send(JSON.stringify({ type: "card-flip", cardIndex: 0 }));
```

## Deployment

### Deploy to PartyKit
```bash
npm run deploy
```

This will:
1. Prompt you to login (if first time)
2. Deploy your party server
3. Give you a production URL like: `your-project.username.partykit.dev`

### Update Client Code
After deploying, update your client code to use the production URL:
```javascript
host: "your-project.username.partykit.dev"
```

## Integration with Your Game

### 1. Add PartySocket to your HTML
```html
<script type="module">
  import PartySocket from "https://cdn.jsdelivr.net/npm/partysocket@1.1.6/+esm";

  const socket = new PartySocket({
    host: "localhost:1999", // or your production URL
    room: "game-123"
  });

  // Your game logic here
</script>
```

### 2. Or use a build tool
If using a bundler (Vite, Webpack, etc.):
```javascript
import PartySocket from "partysocket";
```

### 3. Sync Game Events
When a player flips a card:
```javascript
socket.send(JSON.stringify({
  type: "card-flip",
  cardIndex: index
}));
```

When receiving events:
```javascript
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  // Update your game UI based on data.type
});
```

## Room Management

Each game session should have a unique room ID:
```javascript
// Option 1: Generate random room
const roomId = "game-" + Math.random().toString(36).substring(7);

// Option 2: Use URL parameter
const roomId = new URLSearchParams(window.location.search).get("room");

// Option 3: Let users create/join rooms
const roomId = prompt("Enter room code to join:");
```

## Next Steps

1. Start the dev server: `npm run dev`
2. Integrate PartySocket into `index.html`
3. Add multiplayer UI (player list, room codes)
4. Test with multiple browser windows
5. Deploy when ready: `npm run deploy`
6. Set up Vercel deployment for the static files

## Resources

- PartyKit Docs: https://docs.partykit.io
- PartyKit Examples: https://github.com/partykit/partykit/tree/main/examples
