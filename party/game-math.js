// party/game-math.js

export function generateDeck() {
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
          card.symbols.push(currentSymbolId);
        }
      });
    });
  });

  // Return only the arrays of symbol IDs
  return cards.map(c => c.symbols);
}