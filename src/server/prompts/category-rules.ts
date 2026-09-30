/**
 * Shared by every prompt so the referee, the hint and the bot agree on what a
 * category means. Adapted from the colleague's fork (GAME_SPEC §4 there).
 */
export const CATEGORY_RULES = `Category rules:
- country: a sovereign state that exists today and is a UN member or UN observer state, by its
  official, short or widely used common name (SAD, Amerika, Holandija, Velika Britanija).
  Constituent countries (England, Scotland), historical states and continents are not.
- city: a city or town anywhere. Villages, regions and countries are not.
- river: a river. Lakes, seas and canals are not.
- mountain: a mountain, mountain range or peak.
- sea: a sea or an ocean, by its full or common name (Jadransko more, Jadran). Lakes are not.
- animal: any animal, including birds, fish, insects and breeds. Mythical creatures are not.
- plant: any plant, including trees, flowers, fruits, vegetables and herbs. Fungi are not.
- thing: a concrete physical object. Abstract nouns, places, people, animals and plants are not.`;

/** The letter rule for terms the model itself names (hints and bot answers). */
export const LETTER_RULE = `A term "starts with the round letter" when its Serbian Latin name does, with diacritics
respected: Č is not C, Ć is not C, Š is not S, Ž is not Z, Đ is not D.`;
