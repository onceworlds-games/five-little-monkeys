// Everything a monkey can wear or do: pyjamas, hats, the thread along its slam rings, its launch trail and its win dance.
// Each item opens at a monkey level, with stars on the Bedtime Ladder, or from a Bedtime Box. Pure data: the renderer
// draws each id, presence sends each slot as an index into its list.

export const SLOTS = ['pj', 'hat', 'thread', 'trail', 'dance'];
export const SLOT_NAMES = { pj: 'Pyjamas', hat: 'Hats', thread: 'Ring thread', trail: 'Launch trail', dance: 'Win dance' };

/** [slot, id, name, unlock] — unlock: { level } | { stars } | { box: true } | {} (from the start). */
const ITEMS = [
  ['pj', 'plain', 'Plain', {}],
  ['pj', 'stripes', 'Stripes', { stars: 2 }],
  ['pj', 'dots', 'Polka', { stars: 4 }],
  ['pj', 'checks', 'Checks', { stars: 6 }],
  ['pj', 'moons', 'Moons', { stars: 9 }],
  ['pj', 'bolts', 'Lightning', { stars: 12 }],
  ['pj', 'gold', 'Gold Stars', { stars: 15 }],
  ['pj', 'hearts', 'Hearts', { level: 5 }],
  ['pj', 'clouds', 'Clouds', { level: 10 }],
  ['pj', 'zigzag', 'Zigzag', { level: 15 }],
  ['pj', 'stars', 'Starry', { level: 20 }],
  ['pj', 'spots', 'Leopard', { level: 25 }],
  ['pj', 'tiger', 'Tiger', { level: 32 }],
  ['pj', 'plaid', 'Plaid', { level: 40 }],
  ['pj', 'glow', 'Glow-in-the-Dark', { box: true }],
  ['pj', 'galaxy', 'Galaxy', { box: true }],

  ['hat', 'none', 'No hat', {}],
  ['hat', 'nightcap', 'Nightcap', { level: 2 }],
  ['hat', 'mask', 'Sleep Mask', { level: 7 }],
  ['hat', 'beanie', 'Bobble Beanie', { level: 11 }],
  ['hat', 'crown', 'Paper Crown', { level: 16 }],
  ['hat', 'propeller', 'Propeller Cap', { level: 21 }],
  ['hat', 'bunny', 'Bunny Ears', { level: 26 }],
  ['hat', 'party', 'Party Hat', { level: 30 }],
  ['hat', 'dino', 'Dino Hood', { level: 34 }],
  ['hat', 'headphones', 'Headphones', { level: 38 }],
  ['hat', 'bandana', 'Pirate Bandana', { level: 39 }],
  ['hat', 'goldcap', 'Golden Nightcap', { box: true }],
  ['hat', 'halo', 'Moon Halo', { box: true }],

  ['thread', 'seat', 'Your colour', {}],
  ['thread', 'sunny', 'Sunny', { level: 3 }],
  ['thread', 'mint', 'Mint', { level: 8 }],
  ['thread', 'rainbow', 'Rainbow', { level: 13 }],
  ['thread', 'candy', 'Candy Cane', { level: 17 }],
  ['thread', 'neon', 'Neon', { level: 22 }],
  ['thread', 'gold', 'Gold', { level: 27 }],
  ['thread', 'ember', 'Ember', { level: 31 }],
  ['thread', 'galaxy', 'Galaxy', { level: 36 }],
  ['thread', 'moon', 'Moonbeam', { box: true }],

  ['trail', 'none', 'Puff', {}],
  ['trail', 'feathers', 'Feathers', { level: 4 }],
  ['trail', 'stars', 'Stars', { level: 9 }],
  ['trail', 'bubbles', 'Bubbles', { level: 14 }],
  ['trail', 'confetti', 'Confetti', { level: 19 }],
  ['trail', 'zzz', 'Zzz', { level: 23 }],
  ['trail', 'hearts', 'Hearts', { level: 28 }],
  ['trail', 'bolts', 'Lightning', { level: 35 }],
  ['trail', 'fireflies', 'Fireflies', { box: true }],

  ['dance', 'cheer', 'Cheer', {}],
  ['dance', 'cartwheel', 'Cartwheel', { level: 6 }],
  ['dance', 'thump', 'Chest Thump', { level: 12 }],
  ['dance', 'flop', 'Belly Flop', { level: 18 }],
  ['dance', 'worm', 'The Worm', { level: 24 }],
  ['dance', 'hug', 'Pillow Hug', { level: 29 }],
  ['dance', 'spin', 'Top Spin', { level: 33 }],
  ['dance', 'float', 'Moon Float', { level: 37 }],
  ['dance', 'lullaby', 'Lullaby', { box: true }],
];

export const WARDROBE = ITEMS.map(([slot, id, name, unlock]) => ({ slot, id, name, unlock, key: `${slot}:${id}` }));
export const itemsIn = (slot) => WARDROBE.filter((i) => i.slot === slot);
export const itemByKey = (key) => WARDROBE.find((i) => i.key === key) ?? null;
export const BOX_ITEMS = WARDROBE.filter((i) => i.unlock.box);

/** The default look: index 0 of every slot. */
export const DEFAULT_LOOK = Object.fromEntries(SLOTS.map((s) => [s, itemsIn(s)[0].id]));

/** A look as indexes (for presence), and back (anything unknown falls back to the first item). */
export const lookToIndexes = (look) => SLOTS.map((s) => Math.max(0, itemsIn(s).findIndex((i) => i.id === look?.[s])));
export function lookFromIndexes(arr) {
  const out = {};
  SLOTS.forEach((s, k) => {
    const list = itemsIn(s);
    const i = Number.isInteger(arr?.[k]) && arr[k] >= 0 && arr[k] < list.length ? arr[k] : 0;
    out[s] = list[i].id;
  });
  return out;
}

/** The items that open at exactly level `level` (what a level-up gives). */
export const unlocksAtLevel = (level) => WARDROBE.filter((i) => i.unlock.level === level);

/** Does a player with `level`, `stars` and the box items `boxed` own `item`? */
export function owns(item, { level = 1, stars = 0, boxed = [] } = {}) {
  const u = item.unlock;
  if (u.level) return level >= u.level;
  if (u.stars) return stars >= u.stars;
  if (u.box) return boxed.includes(item.key);
  return true;
}
