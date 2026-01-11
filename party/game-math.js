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

// Level 2: 12-symbol cards (harder)
// Each card has 12 symbols, any 2 cards share exactly 1 symbol
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

export function generateDeck() {
  // Shuffle the deck order and shuffle symbols within each card
  const shuffledDeck = shuffle(LEVEL2_CARDS);

  // Return cards with shuffled symbol order within each card
  return {
    cards: shuffledDeck.map(card => shuffle(card)),
    symbolSet: [...new Set(shuffledDeck.flat())] // Get unique symbols used
  };
}
