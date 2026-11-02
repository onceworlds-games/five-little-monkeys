// The palette, the seat colours and the cast: one place for what everything looks like.

export const PAL = {
  midnight: '#172036',
  moon: '#8FB8FF',
  amber: '#FFB24A',
  red: '#D9473B',
  cream: '#FFF1D6',
  plum: '#2B1B33',
  fur: '#6A4530',
  face: '#E8C39E',
};

/** Seat colours, each with a symbol shape (colour-blind players read the symbol). */
export const COLORS = [
  { id: 'red', hex: '#E5483C', dark: '#9E2A22', symbol: 'square', name: 'Red' },
  { id: 'blue', hex: '#3C86F0', dark: '#1F4E9A', symbol: 'circle', name: 'Blue' },
  { id: 'green', hex: '#39B86E', dark: '#1E7444', symbol: 'triangle', name: 'Green' },
  { id: 'yellow', hex: '#F6C239', dark: '#B5861A', symbol: 'star', name: 'Yellow' },
  { id: 'violet', hex: '#9C6CF0', dark: '#5E3BA8', symbol: 'diamond', name: 'Violet' },
];

/** The four bots: names, colours, personalities and what they wear. */
export const CAST = [
  { name: 'Rumble', kind: 'rumble', color: 0, extra: 'brows', look: { pj: 'stripes', hat: 'bandana', thread: 'ember', trail: 'bolts', dance: 'thump' } },
  { name: 'Tiptoe', kind: 'tiptoe', color: 1, extra: 'bigeyes', look: { pj: 'dots', hat: 'bunny', thread: 'mint', trail: 'bubbles', dance: 'cartwheel' } },
  { name: 'Mimic', kind: 'mimic', color: 2, extra: 'glasses', look: { pj: 'zigzag', hat: 'headphones', thread: 'neon', trail: 'confetti', dance: 'worm' } },
  { name: 'Dozy', kind: 'dozy', color: 3, extra: 'mask', look: { pj: 'stars', hat: 'nightcap', thread: 'moon', trail: 'zzz', dance: 'lullaby' } },
];

/** Ring threads: the colour along the crest of a monkey's slam rings ('seat': its seat colour; 'rainbow' cycles). */
export const THREAD_HEX = {
  sunny: '#FFD24A', mint: '#5FE3B0', candy: '#FF5A7A', neon: '#3DF5FF', gold: '#FFC23A', ember: '#FF6A1A',
  galaxy: '#9A7BFF', moon: '#D6E4FF',
};
/** A thread's colour now (`t` seconds), or null for the seat's own. */
export function threadHex(thread, t = 0) {
  if (thread === 'rainbow') return `hsl(${Math.round((t * 90) % 360)},90%,60%)`;
  return THREAD_HEX[thread] ?? null;
}
export const BOT_NAMES = CAST.map((c) => c.name);
export const castByName = (name) => CAST.find((c) => c.name === name) ?? null;

/** Each bed's room: wall, floor and quilt fabrics. */
export const ROOMS = {
  kid: { wall: '#1E2A4A', wall2: '#243257', floor: '#6B4A33', rug: ['#D9473B', '#FFB24A', '#2E4A7A'], quilt: ['#D9473B', '#F2B544', '#3F6FB0', '#E9DFC8', '#4D8F6A', '#C46A3A'], frame: '#8A5A3B', sheet: '#E8E2D4' },
  bunk: { wall: '#1C3040', wall2: '#22394D', floor: '#5E4632', rug: ['#3E8E6A', '#F2B544', '#2B1B33'], quilt: ['#3F7FB0', '#F2B544', '#D9473B', '#E9DFC8', '#6A5AA8', '#4D8F6A'], frame: '#C7C2B8', sheet: '#DCE4EA' },
  water: { wall: '#3A2A22', wall2: '#46332A', floor: '#4A3426', rug: ['#C8752E', '#E3B04B', '#6E4A2E'], quilt: ['#C8752E', '#E3B04B', '#7A5A3A', '#EAD9B6', '#A64A2E', '#5E7A4A'], frame: '#5A3A26', sheet: '#2E6E8E' },
  king: { wall: '#2A1E2E', wall2: '#33243A', floor: '#3A2A2A', rug: ['#8E1E2E', '#D4A84A', '#2B1B33'], quilt: ['#9E1E30', '#D4A84A', '#7A1424', '#EDE0C0', '#B8323F', '#C9A24A'], frame: '#3A2620', sheet: '#F1E6D2' },
  poster: { wall: '#2E2A3E', wall2: '#383349', floor: '#5A4030', rug: ['#B56A8A', '#E9D7A8', '#5E7A9A'], quilt: ['#C77A9A', '#EAD9B0', '#6A8FB0', '#F3EBD8', '#9AB27A', '#D9A0A0'], frame: '#4A2E22', sheet: '#F3EBD8' },
};
