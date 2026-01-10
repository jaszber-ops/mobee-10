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

export function generateDeck() {
  // Pick 14 random symbols from the 30 available
  const shuffledSymbols = shuffle(ALL_SYMBOLS);
  const selectedSymbols = shuffledSymbols.slice(0, 14);

  // 1. Define the 8 Cards (Vectors [x,y,z] from 000 to 111)
  const cards = [];
  for (let i = 0; i < 8; i++) {
    cards.push({
      id: i,
      vector: [ (i >> 2) & 1, (i >> 1) & 1, i & 1 ],
      symbols: []
    });
  }

  // 2. Define the 7 Coefficients (The "Slope" Vectors)
  const coeffs = [
    [0,0,1], [0,1,0], [0,1,1],
    [1,0,0], [1,0,1], [1,1,0], [1,1,1]
  ];

  // 3. Apply the Affine Geometry Formula
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
    symbolSet: selectedSymbols
  };
}