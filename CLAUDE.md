# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this codebase.

## Project Overview

Møbee Multi is a real-time multiplayer card matching game where players race to find the common symbol between three cards. Built with vanilla JavaScript frontend and PartyKit for real-time multiplayer backend.

**Live URLs:**
- Game: https://mobee-10.trippplecard.games
- Game server (Cloudflare Worker, PartyServer): wss://mobee-multi.jaszber.workers.dev

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: PartyServer on Cloudflare Workers + Durable Objects (PartyKit's successor; the hosted PartyKit platform shut down Oct 2026)
- **Hosting**: Vercel (frontend), Cloudflare Workers (backend)
- **Monitoring**: Sentry error tracking

## Project Structure

```
├── index.html              # Main HTML entry point
├── javascript.js           # Client-side game logic (~1800 lines)
├── style.css               # All styles and animations (~1175 lines)
├── version.js              # Version tracking
├── service-worker.js       # PWA offline support
├── party/
│   ├── server.js           # PartyServer multiplayer server (Durable Object per room)
│   └── game-math.js        # Card generation algorithm (projective plane math)
├── assets/
│   ├── mobee_sprite.svg    # Avatar sprite sheet (130 avatars)
│   ├── symbols/            # 30 individual symbol PNGs
│   ├── mobee_logo.png      # Main logo
│   └── mobee-box/          # Product carousel images (15)
├── wrangler.jsonc          # Cloudflare Workers / Durable Object configuration
├── vercel.json             # Vercel deployment config
├── CLAUDE.md               # This file
├── DOCUMENTATION.md        # Complete technical docs
└── README.md               # Quick start guide
```

## Common Commands

```bash
# Install dependencies
npm install

# Run the game server locally (multiplayer backend)
npm run dev
# or: npx wrangler dev --port 1999 --var ASSET_ORIGIN:http://127.0.0.1:8000

# Serve frontend locally (run in separate terminal)
npx serve .
# or: python3 -m http.server 8000

# Deploy the game server (needs `npx wrangler login` once)
npm run deploy
# or: npx wrangler deploy

# Two-phone end-to-end test (needs playwright + a Chromium; see the header of the file)
node tests/e2e/multiplayer-rules.mjs

# Deploy Vercel frontend
vercel --prod
```

## Architecture Notes

### Client-Server Communication
- WebSocket messages via PartyKit
- Client sends: `START_GAME`, `GUESS`, `UPDATE_AVATAR`, `END_GAME`, `RESET_GAME`
- Server sends: `SESSION`, `NEW_ROUND`, `WINNER`, `WRONG_GUESS`, `UPDATE_SCORES`, `GAME_OVER`, `GAME_RESET`, `ROOM_FULL`, `JOIN_AS_SPECTATOR`

### Game Mechanics
- 30 unique symbols as individual PNG files
- **Level 1**: 7 symbols per card, 8 cards in deck
- **Level 2**: 12 symbols per card, 10 cards in deck
- Any two cards share exactly one common symbol
- 60-second timed rounds, 2-5 players per room
- Correct answer: +1 point; Wrong answer: -1 point (min 0)
- Score 6+ to level up, drop to 0 to level down

### Key Server Constants (party/server.js)
```javascript
LEVEL_UP_THRESHOLD = 6      // Score to advance to Level 2
LEVEL_DOWN_THRESHOLD = 0    // Score to drop back to Level 1
MAX_PLAYERS = 5             // Max players per room
GAME_DURATION_MS = 60000    // 60 seconds per game
GUESS_RATE_LIMIT_MS = 150   // Anti-spam rate limit
```

### State Management
- Player ID persisted in localStorage (`mobee_player_id`)
- Avatar stored in localStorage (`mobee_avatar`)
- Server maintains authoritative game state via PartyKit storage
- Session tokens for security

### Code Organization

**javascript.js** is organized into sections:
1. Imports & Initialization
2. iOS Zoom & Gesture Prevention
3. Game Configuration (symbols, positions)
4. Player Identity & Session
5. Avatar System
6. Room & Connection Setup
7. WebSocket Connection
8. UI State Management
9. Game Timer
10. Single-Player Watchdog
11. Lobby Management
12. Lobby Event Handlers
13. Connection Event Handlers
14. Shop Modal
15. Invite Modal

**style.css** is organized into sections:
1. CSS Variables & Reset
2. Base Layout
3. Game Board & Cards
4. Symbol Positioning (7 and 12 symbol layouts)
5. Card Animations
6. Message Overlay & Countdown
7. Button System
8. Timer Display
9. Footer & Version
10. Modal System
11. Avatar System
12. Lobby Layout
13. Friends Section
14. Mobile Responsive (iPhone)

## Development Tips

- Test multiplayer by opening multiple browser tabs with same `?room=CODE` parameter
- No build step needed for frontend; changes are immediate
- `wrangler dev` auto-reloads on changes to `party/` files
- Room link with `?room=XXXX` goes directly to Play with Friends page
- Single player mode skips the 3-2-1 countdown
- Current version: see `version.js`
