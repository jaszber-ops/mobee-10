# Møbee Multi

A real-time multiplayer card matching game where players race to find the common symbol between three cards.

## Quick Links

- **Play Now**: https://mobee-multi.trippplecard.games
- **Store**: https://mobeecards.store
- **Documentation**: See [DOCUMENTATION.md](DOCUMENTATION.md) for complete details

## What's Included

This package contains the complete Møbee Multi game:

### Core Files
- `index.html` - Main game page
- `script.js` - Client-side game logic
- `style.css` - All styles and animations
- `version.js` - Version tracking (v1.1.0)

### Server
- `party/server.js` - PartyKit multiplayer server
- `party/game-math.js` - Card generation algorithm
- `partykit.json` - PartyKit configuration

### Assets
- `assets/mobee_sprite.svg` - All symbols and avatars in one sprite sheet
- `assets/mobee_logo.png` - Main logo
- `assets/icons/` - PWA icons
- `assets/mobee-box/` - Product carousel images

### Documentation
- `DOCUMENTATION.md` - Complete technical documentation
- `README.md` - This file

## Quick Start

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run PartyKit dev server**:
   ```bash
   npx partykit dev
   ```

3. **Serve frontend** (in another terminal):
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```

4. **Open browser**: `http://localhost:8000`

### Deploy to Production

1. **Deploy PartyKit backend**:
   ```bash
   npx partykit deploy
   ```

2. **Deploy Vercel frontend**:
   ```bash
   vercel --prod
   ```

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: PartyKit (real-time multiplayer)
- **Hosting**: Vercel (frontend), PartyKit (backend)
- **Monitoring**: Sentry error tracking

## Features

- 🎮 Real-time multiplayer (2-5 players)
- 👥 Private rooms with shareable codes
- 🎨 64 customizable avatars
- ⏱️ 60-second timed rounds
- 📱 Mobile-optimized (iOS Safari tested)
- 🌐 Offline PWA support
- 📊 Live scoreboard
- 🎯 Single-player practice mode

## Game Mechanics

- Find the one common symbol shared between three cards
- Each card has 7 symbols from a pool of 57
- Correct answer: +1 point
- Wrong answer: -1 point (min 0)
- Fastest correct click wins the round

## Room System

Create or join rooms using custom codes:
- `https://mobee-multi.trippplecard.games/?room=YOUR_CODE`
- Share link with friends to play together
- Maximum 5 players per room

## Version

Current version: **v1.1.0**

## Support

For questions or support, visit: https://mobeecards.store

## License

Proprietary - All rights reserved
