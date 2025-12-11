# Møbee Multi - Complete Documentation

## Table of Contents
1. [Game Overview](#game-overview)
2. [Game Mechanics](#game-mechanics)
3. [Invitation System](#invitation-system)
4. [Avatar Selection](#avatar-selection)
5. [Technical Stack](#technical-stack)
6. [Architecture](#architecture)
7. [Implementation Details](#implementation-details)
8. [Online Components](#online-components)
9. [PartyKit Integration](#partykit-integration)
10. [Sentry Error Tracking](#sentry-error-tracking)
11. [Deployment](#deployment)

---

## Game Overview

Møbee Multi is a real-time multiplayer card matching game based on the physical Møbee card game. Players compete to be the first to identify the common symbol shared between three cards displayed simultaneously.

### Core Concept
Each card in Møbee contains exactly 7 symbols arranged in a hexagonal pattern. The mathematical guarantee is that any two cards share exactly one common symbol. In the game, three cards are displayed, and players must quickly find and click on the symbol that appears on all three cards.

### Game Modes
- **Single Player**: Practice mode with immediate card replacement (300ms delay)
- **Multiplayer** (2-5 players): Competitive mode with 60-second timed rounds and 4-second celebration/preparation between rounds

### Scoring System
- **Correct answer**: +1 point
- **Wrong answer**: -1 point (minimum score: 0)
- Winner is determined by the fastest correct click

---

## Game Mechanics

### Symbol System
The game uses 57 unique symbols arranged in an 8-column sprite sheet:
- Total symbols: 57 (8×8 grid with 7 unused cells)
- Each card displays 7 symbols from the pool
- Symbols are positioned at 7 fixed locations on hexagonal cards
- Mathematical algorithm ensures exactly one shared symbol between any two cards

### Card Generation
Cards are generated using a projective plane mathematical structure:
- 8 cards total in the deck
- Each card is shuffled independently for variety
- Cards are selected without replacement until all 8 are used
- Algorithm in `party/game-math.js` handles deck generation

### Round Flow
1. **Lobby State**: Players wait for game start
2. **Round Start**: Timer begins (60 seconds), three cards displayed
3. **Player Action**: Players click symbols they think are common
4. **Validation**: Server validates the guess
5. **Result**:
   - Correct: Winner announced, card replaced (single player) or all 3 cards replaced (multiplayer)
   - Wrong: Penalty applied, new round with 3 fresh cards
6. **Auto-advance**: Next round starts automatically (300ms for single player, 4s for multiplayer)

### Timer System
- 60-second countdown per game session
- Starts on first round, continues through multiple rounds
- Pause/resume during winner celebrations
- Displays with tabular numerals for smooth animation
- Resets when returning to lobby

---

## Invitation System

### Room Code System
Players can create or join private rooms using alphanumeric room codes:
- Room code is part of the URL: `https://mobee-multi.trippplecard.games/?room=ABCD`
- Automatically generated if not specified
- Case-insensitive
- Persistent for the session

### Joining Flow
1. **Initial Connection**:
   - User visits site with or without room code
   - Room modal appears if first-time visitor
   - Can enter custom room code or use auto-generated one

2. **Invitation Modal**:
   - Accessible by clicking room code in UI
   - Shows current room code (editable)
   - Provides shareable link
   - Click-to-copy functionality for quick sharing

3. **Link Sharing**:
   - Direct URL sharing: `?room=CUSTOM`
   - URL automatically includes room parameter
   - Friends clicking link join the same room instantly

### Room Management
- Maximum 5 players per room
- Players are automatically removed on disconnect
- Room persists as long as any player is connected
- No room expiration (handled by PartyKit's persistence layer)

---

## Avatar Selection

### Avatar System
Players can personalize their identity with cute animal avatars:
- **Total avatars**: 64 unique animal illustrations
- **Sprite sheet**: `assets/mobee_sprite.svg` (841.89×595.28px)
- **Grid layout**: 8 columns × 8 rows
- **Cell size**: 43.61px per icon

### Avatar Storage
- Stored in `localStorage` as `mobee_avatar`
- Format: `{col}-{row}` (e.g., "3-5")
- Persists across sessions
- Synchronized to server on connection

### Avatar Selection UI
- Grid modal with all 64 avatars
- Hover to preview with scale effect
- Click to select
- Selected avatar has border highlight
- Avatar appears next to player name in scoreboard

### Avatar Display
- Rendered using CSS background-position to show specific sprite
- Displayed as 32px circles in scoreboard
- Scales to 48px in avatar selection grid
- Uses `background-size` calculation: `sprite_dimension × (display_size / cell_size)`

---

## Technical Stack

### Frontend
- **HTML5** with semantic markup
- **CSS3** with modern features:
  - CSS Grid and Flexbox layouts
  - CSS Custom Properties for theming
  - Media queries for responsive design
  - Animations and transitions
- **Vanilla JavaScript** (ES6+ modules)
- **No frameworks** - pure web standards for performance

### Backend/Server
- **PartyKit** - Real-time multiplayer infrastructure
- **Vercel** - Static site hosting and edge functions
- **Sentry** - Error tracking and monitoring

### Assets
- **SVG sprite sheets** for symbols and avatars
- **PNG images** for logos and marketing materials
- **Optimized images** for fast loading

### Build/Deploy
- **Vercel CLI** for production deployments
- **PartyKit CLI** for server deployments
- **Git** for version control

---

## Architecture

### File Structure
```
mobee_multi/
├── index.html              # Main HTML entry point
├── style.css               # All game styles
├── script.js               # Client-side game logic
├── version.js              # Version tracking
├── service-worker.js       # PWA offline support
├── party/
│   ├── server.js          # PartyKit multiplayer server
│   └── game-math.js       # Card generation algorithm
├── assets/
│   ├── mobee_sprite.svg   # Symbol & avatar sprite sheet
│   ├── mobee_logo.png     # Main logo
│   ├── mobee_logo_sm.png  # Card watermark
│   ├── store.png          # Store icon
│   ├── icons/             # PWA icons
│   └── mobee-box/         # Product carousel images
├── partykit.json          # PartyKit configuration
└── vercel.json            # Vercel deployment config
```

### Component Architecture

#### Client (`script.js`)
1. **Connection Manager**: Handles PartySocket WebSocket connection
2. **Game State**: Manages local game state and UI updates
3. **Event Handlers**: User interactions (clicks, modal interactions)
4. **Rendering Engine**: Card and symbol rendering with sprite sheets
5. **Timer System**: Countdown timer with pause/resume
6. **Scoreboard**: Player list with avatars and scores

#### Server (`party/server.js`)
1. **Connection Management**: Player joins/leaves
2. **Game State Manager**: Authoritative game state
3. **Round Manager**: Card dealing and validation
4. **Score System**: Points calculation and tracking
5. **Broadcast System**: State synchronization to all clients

### Data Flow
```
Client Action (Click Symbol)
    ↓
WebSocket Message (GUESS)
    ↓
PartyKit Server Validation
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

### Symbol Rendering Optimization
The game uses sprite sheets instead of individual files for performance:

```javascript
// Calculate sprite position
const cellLeft = SPRITE_GRID_START_X + (col * SPRITE_CELL_SIZE);
const cellTop = SPRITE_GRID_START_Y + (row * SPRITE_CELL_SIZE);

// Scale to display size
const scaleFactor = displaySize / SPRITE_CELL_SIZE;
const bgX = -(cellLeft * scaleFactor);
const bgY = -(cellTop * scaleFactor);

// Apply as background
background-image: url('assets/mobee_sprite.svg');
background-size: ${svgWidth * scaleFactor}px ${svgHeight * scaleFactor}px;
background-position: ${bgX}px ${bgY}px;
```

### Card Positioning
Cards are positioned in a triangular formation using CSS:
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

### Player Persistence
Players are tracked across reconnections:
```javascript
// Generate persistent ID
const playerId = localStorage.getItem('mobee_player_id') ||
                 'p_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('mobee_player_id', playerId);

// Pass to PartyKit connection
const ws = new PartySocket({
  host: PARTYKIT_HOST,
  room: roomCode,
  query: { playerId }
});
```

### Mobile Optimization
- Responsive symbol sizing: 34% container width, 0.65 scale on mobile
- Touch-optimized: `touch-action: none`, proper pointer events
- Safe area support: `padding-top: env(safe-area-inset-top)`
- Viewport fit: `viewport-fit=cover` for edge-to-edge display

---

## Online Components

### Real-time Multiplayer
All game state is synchronized via WebSocket connections:
- Player connections/disconnections
- Card dealing and round starts
- Guesses and validations
- Score updates
- Timer synchronization

### Message Types

#### Client → Server
- `START_GAME`: Request new round
- `GUESS`: Submit symbol guess with card index
- `GET_SCORES`: Request current scores
- `UPDATE_AVATAR`: Change player avatar
- `END_GAME`: Timer reached zero
- `RESET_GAME`: Reset scores and return to lobby

#### Server → Client
- `NEW_ROUND`: Three cards with shuffled symbols
- `WINNER`: Announce round winner
- `WRONG_GUESS`: Wrong answer penalty
- `UPDATE_SCORES`: Scoreboard update
- `GAME_RESET`: Return to lobby
- `ROOM_FULL`: Reject connection (5 player limit)
- `JOIN_AS_SPECTATOR`: New player joins mid-round

### State Persistence
PartyKit provides durable state storage:
```javascript
// Save state
await this.party.storage.put("gamestate", state);

// Load state
let state = await this.party.storage.get("gamestate");
```

State includes:
- Current deck and shuffled cards
- Active players and scores
- Player avatars
- Game status (waiting/playing)
- Current answer
- Game start time

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

### Server Class Structure
```javascript
export default class MobeeServer {
  constructor(party) {
    this.party = party;
  }

  async onConnect(conn) {
    // Handle new player connection
  }

  async onMessage(message, sender) {
    // Handle messages from clients
  }

  async onClose(conn) {
    // Handle player disconnect
  }

  async startNewRound(state, replaceCardIndex) {
    // Deal cards and broadcast
  }
}
```

### Connection Management
- Each connection has a unique `conn.id`
- Persistent player ID passed via query params
- Automatic cleanup of disconnected players
- Maximum 5 players per room enforced

### Card Replacement Strategy
- **Correct answer**: Replace only the clicked card (single player) or all 3 cards (multiplayer)
- **Wrong answer**: Replace all 3 cards
- Cards are selected from remaining deck without replacement
- Ensures variety and prevents repetition

### Room Isolation
Each room code creates an isolated PartyKit instance:
- Separate game state
- Independent player lists
- Isolated message broadcasts
- No cross-room communication

---

## Sentry Error Tracking

### Integration
Sentry is loaded via CDN with automatic initialization:
```html
<script
  src="https://js-de.sentry-cdn.com/9ed59983028a134d7d78bce7324ce25f.min.js"
  crossorigin="anonymous"
  onload="
    if (typeof Sentry !== 'undefined' && Sentry.setUser) {
      const playerId = localStorage.getItem('mobee_player_id');
      if (playerId) {
        Sentry.setUser({ id: playerId });
      }
    }
  "
></script>
```

### User Context
- Each player is tagged with their persistent `playerId`
- Helps track errors per user
- Maintains privacy (no PII)

### Captured Events
Sentry automatically captures:
- JavaScript errors and exceptions
- Unhandled promise rejections
- Browser console errors
- Network errors
- Performance metrics

### Benefits
- Real-time error alerts
- Stack traces for debugging
- User impact analysis
- Performance monitoring
- Release tracking with version numbers

---

## Deployment

### Vercel Deployment (Frontend)
```bash
# Deploy to production
vercel --prod

# Production URLs
https://mobeemulti.vercel.app
https://mobee-multi.trippplecard.games
```

**Configuration** (`vercel.json`):
```json
{
  "buildCommand": "echo 'No build needed'",
  "outputDirectory": ".",
  "cleanUrls": true,
  "trailingSlash": false
}
```

### PartyKit Deployment (Backend)
```bash
# Deploy multiplayer server
npx partykit deploy

# Server URL
wss://mobee-multi.partykit.dev
```

### Deployment Checklist
1. Update version in `version.js`
2. Test locally
3. Deploy PartyKit server: `npx partykit deploy`
4. Deploy Vercel frontend: `vercel --prod`
5. Verify both URLs are working
6. Check Sentry for any deployment errors

### Version Management
Current version: **v1.1.0**

Version format: `MAJOR.MINOR.PATCH`
- **MAJOR**: Major feature additions or breaking changes
- **MINOR**: New features, significant improvements
- **PATCH**: Bug fixes, small adjustments

Version is displayed in:
- Console log on page load
- Footer of the page
- Sentry release tracking

### Environment Variables
None required - all configuration is hardcoded for simplicity.

### Domain Configuration
- **Primary**: `https://mobee-multi.trippplecard.games`
- **Secondary**: `https://mobeemulti.vercel.app`
- **PartyKit**: `wss://mobee-multi.partykit.dev`

---

## Development

### Local Development
```bash
# Install dependencies
npm install

# Run PartyKit dev server
npx partykit dev

# Serve frontend
python3 -m http.server 8000
# or
npx serve .
```

### Testing Multiplayer
1. Open multiple browser windows/tabs
2. Use different room codes for isolation
3. Test with different player counts (1-5)
4. Test edge cases: disconnections, rejoins, rapid clicks

### Browser Compatibility
- Chrome/Edge: Full support
- Safari/iOS Safari: Full support (tested extensively)
- Firefox: Full support
- Mobile browsers: Optimized for touch

### Performance Optimization
- Sprite sheets reduce HTTP requests
- CSS animations use GPU acceleration
- WebSocket for efficient real-time sync
- Service worker for offline support
- Lazy loading for carousel images

---

## Future Enhancements

### Potential Features
- Private rooms with passwords
- Tournament mode with brackets
- Leaderboards and statistics
- Sound effects and music
- More symbols and cards
- Custom card themes
- Replay system
- Achievements and badges

### Technical Improvements
- TypeScript migration
- End-to-end testing
- Automated deployment pipeline
- Analytics dashboard
- Admin panel for room management

---

## Credits

**Game Design**: Based on the physical Møbee card game
**Development**: Built with Vercel, PartyKit, and modern web standards
**Version**: 1.1.0
**License**: Proprietary

For support or questions: https://mobeecards.store

---

## Appendix

### URLs
- **Production Game**: https://mobee-multi.trippplecard.games
- **Vercel Dashboard**: https://vercel.com/ajs-projects-641d0e7e/mobee_multi
- **PartyKit Dashboard**: https://partykit.io
- **Store**: https://mobeecards.store
- **Sentry Dashboard**: https://sentry.io

### Key Files Reference
- **Client Logic**: `script.js` (~1000 lines)
- **Server Logic**: `party/server.js` (~393 lines)
- **Styles**: `style.css` (~507 lines)
- **Game Math**: `party/game-math.js` (Card generation algorithm)
- **HTML**: `index.html` (Main structure with modals)

### Performance Metrics
- Initial load: ~200KB total
- Sprite sheet: ~180KB (all symbols + avatars)
- First contentful paint: <1s
- Time to interactive: <2s
- WebSocket latency: <100ms (typical)
