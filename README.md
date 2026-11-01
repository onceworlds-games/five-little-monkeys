# Five Little Monkeys

Five plush monkeys bounce on one giant bed. Slam the quilt and the ring of fabric launches the others off. Pump your
bounce with perfect presses, grab the golden banana, a pillow or a spring, ride the twists, and be the last monkey
jumping. Up to five players; bots with personalities fill the empty seats. Between matches: Tonight's Rush (an endless
line of monkeys, the same bed and twist for everyone), levels, a wardrobe of pyjamas, hats, ring threads, trails and win
dances, three goals a night and the Bedtime Box.

Play: https://onceworlds.com/play/five-little-monkeys

- `npm install`, then `npm run build` (Vite, into `dist/`). `npm run bake` rebuilds the plush bodies.
- `npm test`: the physics, rings, pump, toys, twists, bots and round rules, the Rush, progression and the wardrobe,
  balance simulations, message checks, and whole matches through a fake room.
- `?poster=cover|action|win|multi|icon|badge-<id>` draws the store art. On local hosts only: `?autoplay=1` lets the bots
  play your seat (captures; `&bed=water`, `&twist=dark` pick the bed and a first-round twist), `?logoonly=1` shows
  only the name on the title, `?quality=low|medium|high` picks the graphics, `?debug` shows the draw calls.

How it plays, the numbers and the netcode: [DESIGN.md](DESIGN.md). Models, textures, sounds and fonts: [CREDITS.md](CREDITS.md).

MIT licensed.
