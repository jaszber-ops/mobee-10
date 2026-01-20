/**
 * Møbee Multi - Card Deck Generation
 *
 * Generates decks of cards where any two cards share exactly one common symbol.
 * Uses projective plane mathematics for Level 1 (7 symbols per card).
 * Uses a pre-defined validated deck for Level 2 (12 symbols per card).
 */

// =============================================================================
// CONSTANTS
// =============================================================================

// All 30 available symbols in the game
const ALL_SYMBOLS = [
  'dog', 'pigeon', 'mobius', 'leaf', 'cat', 'doll', 'elephant', 'cherry',
  'star', 'fan', 'lion', 'airplane', 'ufo', 'train', 'rhino', 'saturn',
  'pig', 'globe', 'helicopter', 'lightbulb', 'shark', 'snowflake', 'shoe',
  'pawprint', 'sunglasses', 'coffee', 'sailboat', 'frenchhorn', 'flower', 'hourglass'
];

// Pre-defined Level 2 deck (12 symbols per card, 10 cards)
// Any 2 cards share exactly 1 symbol
const LEVEL2_DECK = [
  ['pawprint', 'shoe', 'airplane', 'star', 'coffee', 'lightbulb', 'rhino', 'train', 'sunglasses', 'hourglass', 'sailboat', 'shark'],
  ['shoe', 'saturn', 'pawprint', 'snowflake', 'fan', 'airplane', 'lion', 'dog', 'doll', 'helicopter', 'lightbulb', 'mobius'],
  ['mobius', 'snowflake', 'doll', 'shoe', 'sunglasses', 'globe', 'cherry', 'elephant', 'hourglass', 'train', 'frenchhorn', 'pig'],
  ['train', 'leaf', 'elephant', 'rhino', 'frenchhorn', 'lightbulb', 'cat', 'saturn', 'fan', 'ufo', 'snowflake', 'sailboat'],
  ['sailboat', 'pig', 'leaf', 'pawprint', 'pigeon', 'snowflake', 'globe', 'helicopter', 'ufo', 'sunglasses', 'lion', 'coffee'],
  ['hourglass', 'dog', 'rhino', 'mobius', 'globe', 'fan', 'pawprint', 'flower', 'shark', 'ufo', 'frenchhorn', 'pigeon'],
  ['dog', 'lion', 'star', 'lightbulb', 'cherry', 'leaf', 'doll', 'frenchhorn', 'cat', 'sunglasses', 'shark', 'pigeon'],
  ['helicopter', 'elephant', 'doll', 'pig', 'hourglass', 'sailboat', 'cat', 'flower', 'fan', 'pigeon', 'airplane', 'star'],
  ['flower', 'shark', 'saturn', 'mobius', 'lion', 'cat', 'airplane', 'cherry', 'coffee', 'pig', 'train', 'ufo'],
  ['star', 'dog', 'shoe', 'saturn', 'helicopter', 'cherry', 'elephant', 'rhino', 'leaf', 'coffee', 'flower', 'globe']
];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Fisher-Yates shuffle for unbiased random array ordering
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// DECK GENERATION
// =============================================================================

/**
 * Generate Level 1 deck: 8 cards with 7 symbols each
 *
 * Uses affine plane geometry over GF(2) (binary field):
 * - 8 cards represented as 3-bit vectors (000 to 111)
 * - 7 "slopes" determine symbol assignments
 * - Each slope generates 2 symbols (one for each parity)
 * - Result: 14 unique symbols, 7 per card
 * - Any 2 cards share exactly 1 symbol
 */
export function generateLevel1Deck() {
  // Select 14 random symbols from available pool
  const symbols = shuffle(ALL_SYMBOLS).slice(0, 14);

  // Create 8 cards with 3-bit vector identifiers
  const cards = Array.from({ length: 8 }, (_, i) => ({
    vector: [(i >> 2) & 1, (i >> 1) & 1, i & 1],
    symbols: []
  }));

  // The 7 non-zero coefficient vectors ("slopes")
  const coefficients = [
    [0, 0, 1], [0, 1, 0], [0, 1, 1],
    [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1]
  ];

  // Assign symbols using affine geometry formula
  // Card gets symbol if: (a*x + b*y + c*z) mod 2 === d
  let symbolIndex = 0;

  for (const [a, b, c] of coefficients) {
    for (const parity of [0, 1]) {
      const symbol = symbols[symbolIndex++];

      for (const card of cards) {
        const [x, y, z] = card.vector;
        const dotProduct = (a * x + b * y + c * z) % 2;

        if (dotProduct === parity) {
          card.symbols.push(symbol);
        }
      }
    }
  }

  return {
    cards: cards.map(c => c.symbols),
    symbolSet: symbols,
    level: 1,
    symbolsPerCard: 7
  };
}

/**
 * Generate Level 2 deck: 10 cards with 12 symbols each
 *
 * Uses a pre-validated deck where any 2 cards share exactly 1 symbol.
 * Deck and symbol order are shuffled for variety.
 */
export function generateLevel2Deck() {
  const shuffledDeck = shuffle(LEVEL2_DECK);

  return {
    cards: shuffledDeck.map(card => shuffle(card)),
    symbolSet: [...new Set(LEVEL2_DECK.flat())],
    level: 2,
    symbolsPerCard: 12
  };
}

/**
 * Generate a deck for the specified level
 */
export function generateDeck(level = 1) {
  return level === 2 ? generateLevel2Deck() : generateLevel1Deck();
}
