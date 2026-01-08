import assert from "node:assert/strict";
import test from "node:test";
import { generateDeck } from "../party/game-math.js";

test("generateDeck builds the expected card and symbol layout", () => {
  const deck = generateDeck();

  assert.equal(deck.length, 8, "deck has 8 cards");
  deck.forEach((card, index) => {
    assert.equal(card.length, 7, `card ${index} has 7 symbols`);
    card.forEach((symbolId) => {
      assert.ok(
        Number.isInteger(symbolId) && symbolId >= 0 && symbolId <= 13,
        "symbol IDs are 0..13"
      );
    });
  });

  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const intersection = deck[i].filter((symbolId) =>
        deck[j].includes(symbolId)
      );
      assert.equal(
        intersection.length,
        3,
        `cards ${i} and ${j} share 3 symbols`
      );
    }
  }
});
