# Møbee Multi - Complete Documentation

## Table of Contents
1. [Game Overview](#game-overview)
2. [Game Mechanics](#game-mechanics)
3. [Difficulty Levels](#difficulty-levels)
4. [Invitation System](#invitation-system)
5. [Avatar Selection](#avatar-selection)
6. [Technical Stack](#technical-stack)
7. [Architecture](#architecture)
8. [Implementation Details](#implementation-details)
9. [Online Components](#online-components)
10. [PartyKit Integration](#partykit-integration)
11. [Sentry Error Tracking](#sentry-error-tracking)
12. [Deployment](#deployment)

---

## Game Overview

Møbee Multi is a real-time multiplayer card matching game based on the physical Møbee card game. Players compete to be the first to identify the common symbol shared between three cards displayed simultaneously.

### Core Concept
Each card in Møbee contains symbols arranged in a hexagonal pattern. The mathematical guarantee is that any two cards share exactly one common symbol. In the game, three cards are displayed, and players must quickly find and click on the symbol that appears on all three cards.

### Game Modes
- **Single Player**: Practice mode with immediate card replacement (300ms delay)
- **Multiplayer** (2-5 players): Competitive mode with 60-second timed rounds and 3-2-1 countdown between rounds

### Scoring System
- **Correct answer**: +1 point
- **Wrong answer**: -1 point (minimum score: 0)
- Winner is determined by the fastest correct click
- Score 6+ correct answers to level up to harder cards

---

## Game Mechanics

### Symbol System
The game uses 30 unique symbols as individual PNG files:
- Located in `assets/symbols/` directory
- Each symbol has a descriptive name (dog, cat, star, etc.)
- Symbols are randomly selected for each deck generation

### Card Generation
Cards are generated using projective plane mathematics:

**Level 1 (7 symbols per card)**:
- Uses affine plane geometry over GF(2) (binary field)
- 8 cards in deck, 14 unique symbols
- Each card represented as 3-bit vector
- Algorithm in `party/game-math.js`

**Level 2 (12 symbols per card)**:
- Pre-validated deck of 10 cards
- Uses all 30 available symbols
- Cards shuffled for variety each game

### Round Flow
1. **Lobby State**: Players wait for game start
2. **Countdown**: 3-2-1 countdown (multiplayer with 2+ players only)
3. **Round Start**: Timer begins (60 seconds), three cards displayed
4. **Player Action**: Players click symbols they think are common
5. **Validation**: Server validates the guess
6. **Result**:
   - Correct: Card replaced, next round starts
   - Wrong: Penalty applied, new round with 3 fresh cards
7. **Auto-advance**: Next round starts automatically

### Timer System
- 60-second countdown per game session
- Starts on first round, continues through multiple rounds
- Pause/resume during winner celebrations (multiplayer)
- Displays with tabular numerals for smooth animation
- Urgent animation when 5 seconds or less remain

---

## Difficulty Levels

### Level 1: Beginner (7 Symbols)
- 7 symbols per card
- 8 cards total in deck
- 14 unique symbols in pool
- Center symbol + 6 arranged around
- Easier to spot the common symbol

### Level 2: Advanced (12 Symbols)
- 12 symbols per card
- 10 cards total in deck
- 30 unique symbols in pool
- Inner/outer cardinal + diagonal positions
- More challenging visual search

### Level Progression
- Start at Level 1
- Score 6+ correct answers to qualify for Level 2
- Wrong answer at score 0 drops back to Level 1
- Level up shown with product image (physical card game promo)

---

## Invitation System

### Room Code System
Players can create or join private rooms using alphanumeric room codes:
- Room code is part of the URL: `https://mobee-10.trippplecard.games/?room=ABCDEF`
- 6-character alphanumeric codes (A-Z, 0-9)
- Case-insensitive
- Excludes confusing characters (I, 1, O, 0)

### Joining Flow
1. **Direct Link**: Clicking a room link goes directly to Play with Friends
2. **Manual Entry**: Enter room code in the Room Code card
3. **Copy/Share**: Copy room link or use native share on mobile

### Room Management
- Maximum 5 players per room
- Players are automatically removed on disconnect
- Room persists as long as any player is connected
- Host (first player) can start the game

---

## Avatar Selection

### Avatar System
Players personalize their identity with avatars from the sprite sheet:
- **Total avatars**: 130 (13 columns × 10 rows)
- **Sprite sheet**: `assets/mobee_sprite.svg` (841.89×595.28px)
- **Cell size**: 43.61px per icon

### Avatar Storage
- Stored in `localStorage` as `mobee_avatar`
- Format: `col,row` (e.g., "3,5")
- Persists across sessions
- Synchronized to server on connection

### Avatar Display
- Rendered using CSS background-position
- 32px in scoreboard, 36px during gameplay
- 48px in avatar selection grid
- Yellow border for own avatar, green for others

---

## Technical Stack

### Frontend
- **HTML5** with semantic markup
- **CSS3** with modern features:
  - CSS Grid and Flexbox layouts
  - CSS Custom Properties (variables)
  - Media queries for responsive design
  - Animations and transitions
- **Vanilla JavaScript** (ES6+ modules)
- **No frameworks** - pure web standards for performance

### Backend/Server
- **PartyKit** - Real-time multiplayer infrastructure
- **Vercel** - Static site hosting
- **Sentry** - Error tracking and monitoring

### Assets
- **SVG sprite sheet** for avatars
- **PNG images** for symbols, logos, and marketing
- **Optimized images** for fast loading

---

## Architecture

### File Structure
```
mobee-10/
├── index.html              # Main HTML entry point
├── javascript.js           # Client-side game logic (~1800 lines)
├── style.css               # All game styles (~1175 lines)
├── version.js              # Version tracking
├── service-worker.js       # PWA offline support
├── party/
│   ├── server.js           # PartyKit multiplayer server (~400 lines)
│   └── game-math.js        # Card generation algorithm (~130 lines)
├── assets/
│   ├── mobee_sprite.svg    # Avatar sprite sheet
│   ├── symbols/            # 30 individual symbol PNGs
│   ├── mobee_logo.png      # Main logo
│   ├── mobee_logo_sm.png   # Card watermark
│   ├── icons/              # PWA icons
│   └── mobee-box/          # Product carousel images (15)
├── partykit.json           # PartyKit configuration
├── vercel.json             # Vercel deployment config
├── CLAUDE.md               # AI assistant guidance
├── DOCUMENTATION.md        # This file
└── README.md               # Quick start guide
```

### Component Architecture

#### Client (`javascript.js`)
Organized into 15 sections:
1. Imports & Initialization
2. iOS Zoom & Gesture Prevention
3. Game Configuration
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

#### Server (`party/server.js`)
Organized into sections:
1. Constants (timing, thresholds, limits)
2. Helper Functions (payload creation)
3. Main Server Class
4. Connection Management
5. Message Handling
6. Game Logic (rounds, scoring, levels)
7. Broadcast System

### Data Flow
```
Client Action (Click Symbol)
    ↓
WebSocket Message (GUESS + sessionToken)
    ↓
PartyKit Server Validation
    ↓
Rate Limit Check (150ms)
    ↓
Symbol Validation
    ↓
Update Game State
    ↓
Broadcast Result (WINNER/WRONG_GUESS)
    ↓
All Clients Update UI
    ↓
Auto-start Next Round
```

---

## Implementation Details

### Symbol Rendering
Individual PNG files are used for symbols:
```javascript
const SYMBOLS = {
    'dog': 'assets/symbols/dog.png',
    'cat': 'assets/symbols/cat.png',
    // ... 30 total symbols
};

// Preload all symbols
Object.values(SYMBOLS).forEach(src => {
    const im = new Image();
    im.src = src;
});
```

### Card Positioning
Cards are positioned in a triangular formation:
```css
.card:nth-child(1) {
    top: calc(50% - var(--spread-radius));
    left: 50%;
}
.card:nth-child(2) {
    top: calc(50% + (var(--spread-radius) * 0.5));
    left: calc(50% + (var(--spread-radius) * 0.866));
}
.card:nth-child(3) {
    top: calc(50% + (var(--spread-radius) * 0.5));
    left: calc(50% - (var(--spread-radius) * 0.866));
}
```

### Session Token Security
Each connection receives a unique session token:
```javascript
// Server generates token on connect
const sessionToken = crypto.randomUUID();
conn.send(JSON.stringify({ type: "SESSION", sessionToken }));

// Client includes token with guesses
safeSend({
    type: "GUESS",
    symbol: symbolName,
    sessionToken: sessionToken
});
```

### Mobile Optimization
- Responsive symbol sizing with CSS variables
- Touch-optimized: `touch-action: none`
- Safe area support: `env(safe-area-inset-top)`
- Viewport fit: `viewport-fit=cover`
- Transform scale for iPhone: `scale(1.12)`

---

## Online Components

### Real-time Multiplayer
All game state is synchronized via WebSocket:
- Player connections/disconnections
- Card dealing and round starts
- Guesses and validations
- Score updates
- Timer synchronization
- Level changes

### Message Types

#### Client → Server
| Message | Description |
|---------|-------------|
| `START_GAME` | Request new round/game |
| `GUESS` | Submit symbol guess with sessionToken |
| `UPDATE_AVATAR` | Change player avatar |
| `END_GAME` | Timer reached zero |
| `RESET_GAME` | Reset scores and return to lobby |

#### Server → Client
| Message | Description |
|---------|-------------|
| `SESSION` | Provide session token |
| `NEW_ROUND` | Three cards with symbols and level |
| `WINNER` | Announce round winner |
| `WRONG_GUESS` | Wrong answer penalty |
| `UPDATE_SCORES` | Scoreboard update |
| `GAME_OVER` | Game ended, show results |
| `GAME_RESET` | Return to lobby |
| `ROOM_FULL` | Reject connection (5 player limit) |

### State Persistence
PartyKit provides durable state storage:
```javascript
// Save state
await this.party.storage.put("gamestate", state);

// Load state
let state = await this.party.storage.get("gamestate");
```

State includes:
- Current deck and cards
- Active players and scores
- Player avatars and levels
- Game status and timing
- Current answer
- Session tokens

---

## PartyKit Integration

### Configuration (`partykit.json`)
```json
{
    "name": "mobee-multi",
    "main": "party/server.js",
    "compatibilityDate": "2024-01-10"
}
```

### Server Constants
```javascript
const LEVEL_UP_THRESHOLD = 6;      // Score to level up
const LEVEL_DOWN_THRESHOLD = 0;    // Score to level down
const MAX_PLAYERS = 5;             // Max per room
const GAME_DURATION_MS = 60000;    // 60 seconds
const COUNTDOWN_DURATION_MS = 3000; // 3-2-1 countdown
const GUESS_RATE_LIMIT_MS = 150;   // Anti-spam
const SINGLE_PLAYER_DELAY = 300;   // Next round delay
const MULTI_PLAYER_DELAY = 4000;   // Winner celebration
```

### Connection Management
- Each connection has unique `conn.id`
- Persistent player ID via query params
- Automatic cleanup on disconnect
- Message queue for sequential processing

---

## Sentry Error Tracking

### Integration
```html
<script
    src="https://js-de.sentry-cdn.com/..."
    onload="
        if (Sentry.setUser) {
            const playerId = localStorage.getItem('mobee_player_id');
            if (playerId) Sentry.setUser({ id: playerId });
        }
    "
></script>
```

### Custom Error Logging
```javascript
if (typeof Sentry !== 'undefined') {
    Sentry.captureException(error, {
        tags: { component: 'websocket' },
        extra: { roomCode, readyState }
    });
}
```

---

## Deployment

### Vercel Deployment (Frontend)
```bash
vercel --prod

# Production URL
https://mobee-10.trippplecard.games
```

### PartyKit Deployment (Backend)
```bash
npx partykit deploy

# Server URL
wss://mobee-multi.jaszber-ops.partykit.dev
```

### Deployment Checklist
1. Update version in `version.js`
2. Test locally with `npx partykit dev`
3. Deploy PartyKit: `npx partykit deploy`
4. Deploy Vercel: `vercel --prod`
5. Verify game works at production URL
6. Check Sentry for any errors

### Version Management
Current version: **v1.5.118**

Version format: `MAJOR.MINOR.PATCH`
- **MAJOR**: Breaking changes or major features
- **MINOR**: New features, significant improvements
- **PATCH**: Bug fixes, small adjustments

---

## Development

### Local Development
```bash
# Install dependencies
npm install

# Run PartyKit dev server
npx partykit dev

# Serve frontend (separate terminal)
npx serve .
# or: python3 -m http.server 8000
```

### Testing Multiplayer
1. Open multiple browser windows/tabs
2. Use same room code: `?room=TEST`
3. Test with different player counts (1-5)
4. Test edge cases: disconnections, rapid clicks

### Browser Compatibility
- Chrome/Edge: Full support
- Safari/iOS Safari: Full support (tested extensively)
- Firefox: Full support
- Mobile browsers: Optimized for touch

---

## Credits

**Game Design**: Based on the physical Møbee card game
**Development**: Built with Vercel, PartyKit, and modern web standards
**Version**: 1.5.118
**License**: Proprietary

For support: https://mobeecards.store
