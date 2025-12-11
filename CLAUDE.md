# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this codebase.

## Project Overview

Møbee Multi is a real-time multiplayer card matching game where players race to find the common symbol between three cards. Built with vanilla JavaScript frontend and PartyKit for real-time multiplayer backend.

**Live URLs:**
- Game: https://mobee-multi.trippplecard.games
- PartyKit WebSocket: wss://mobee-multi.partykit.dev

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: PartyKit (real-time multiplayer WebSocket server)
- **Hosting**: Vercel (frontend), PartyKit (backend)
- **Monitoring**: Sentry error tracking

## Project Structure

```
├── index.html              # Main HTML entry point
├── script.js               # Client-side game logic
├── style.css               # All styles and animations
├── version.js              # Version tracking
├── service-worker.js       # PWA offline support
├── party/
│   ├── server.js           # PartyKit multiplayer server
│   └── game-math.js        # Card generation algorithm (projective plane math)
├── assets/
│   └── mobee_sprite.svg    # All symbols (57) and avatars (64) in sprite sheet
├── partykit.json           # PartyKit configuration
└── vercel.json             # Vercel deployment config
```

## Common Commands

```bash
# Install dependencies
npm install

# Run PartyKit dev server (multiplayer backend)
npm run dev
# or: npx partykit dev

# Serve frontend locally (run in separate terminal)
npx serve .
# or: python3 -m http.server 8000

# Deploy PartyKit backend
npm run deploy
# or: npx partykit deploy

# Deploy Vercel frontend
vercel --prod
```

## Architecture Notes

### Client-Server Communication
- WebSocket messages via PartyKit
- Client sends: `START_GAME`, `GUESS`, `GET_SCORES`, `UPDATE_AVATAR`, `END_GAME`, `RESET_GAME`
- Server sends: `NEW_ROUND`, `WINNER`, `WRONG_GUESS`, `UPDATE_SCORES`, `GAME_RESET`, `ROOM_FULL`

### Game Mechanics
- 57 unique symbols in 8×8 sprite grid (7 unused cells)
- Each card has 7 symbols; any two cards share exactly one common symbol
- 60-second timed rounds, 2-5 players per room
- Correct answer: +1 point; Wrong answer: -1 point (min 0)

### State Management
- Player ID persisted in localStorage (`mobee_player_id`)
- Avatar stored in localStorage (`mobee_avatar`)
- Server maintains authoritative game state via PartyKit storage

## Development Tips

- Test multiplayer by opening multiple browser tabs with same `?room=CODE` parameter
- No build step needed for frontend; changes are immediate
- PartyKit dev server auto-reloads on changes to `party/` files
- Current version: v1.1.1 (check `version.js`)
