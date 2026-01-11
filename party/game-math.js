// party/game-math.js

// Fisher-Yates shuffle
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// All 30 available symbols
const ALL_SYMBOLS = [
  'dog', 'pigeon', 'mobius', 'leaf', 'cat', 'doll', 'elephant', 'cherry',
  'star', 'fan', 'lion', 'airplane', 'ufo', 'train', 'rhino', 'saturn',
  'pig', 'globe', 'helicopter', 'lightbulb', 'shark', 'snowflake', 'shoe',
  'pawprint', 'sunglasses', 'coffee', 'sailboat', 'frenchhorn', 'flower', 'hourglass'
];

// Level 1: 7-symbol cards (8 cards in deck)
// Uses projective plane math to generate cards where any 2 share exactly 1 symbol
export function generateLevel1Deck() {
  // Pick 14 random symbols from the 30 available
  const shuffledSymbols = shuffle(ALL_SYMBOLS);
  const selectedSymbols = shuffledSymbols.slice(0, 14);

  // Define the 8 Cards (Vectors [x,y,z] from 000 to 111)
  const cards = [];
  for (let i = 0; i < 8; i++) {
    cards.push({
      id: i,
      vector: [ (i >> 2) & 1, (i >> 1) & 1, i & 1 ],
      symbols: []
    });
  }

  // Define the 7 Coefficients (The "Slope" Vectors)
  const coeffs = [
    [0,0,1], [0,1,0], [0,1,1],
    [1,0,0], [1,0,1], [1,1,0], [1,1,1]
  ];

  // Apply the Affine Geometry Formula
  // (a*x + b*y + c*z) % 2 === d
  let symbolIdCounter = 0;

  coeffs.forEach(([a, b, c]) => {
    [0, 1].forEach(d => {
      const currentSymbolId = symbolIdCounter++; // 0 to 13

      cards.forEach(card => {
        const [x, y, z] = card.vector;
        const dotProduct = (a*x + b*y + c*z) % 2;

        if (dotProduct === d) {
          // Use the symbol name instead of index
          card.symbols.push(selectedSymbols[currentSymbolId]);
        }
      });
    });
  });

  // Return the cards with symbol names
  return {
    cards: cards.map(c => c.symbols),
    symbolSet: selectedSymbols,
    level: 1,
    symbolsPerCard: 7
  };
}

// Level 2: 12-symbol cards (10 cards in deck)
// Pre-defined deck where any 2 cards share exactly 1 symbol
const LEVEL2_CARDS = [
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

export function generateLevel2Deck() {
  // Shuffle the deck order and shuffle symbols within each card
  const shuffledDeck = shuffle(LEVEL2_CARDS);

  // Return cards with shuffled symbol order within each card
  return {
    cards: shuffledDeck.map(card => shuffle(card)),
    symbolSet: [...new Set(LEVEL2_CARDS.flat())],
    level: 2,
    symbolsPerCard: 12
  };
}

// Default export for backwards compatibility - generates level 1
export function generateDeck(level = 1) {
  if (level === 2) {
    return generateLevel2Deck();
  }
  return generateLevel1Deck();
}
