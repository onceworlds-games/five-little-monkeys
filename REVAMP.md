# Five Little Monkeys: teardown and rebuild plan

Played the `main` build headless (20 s of autoplay at 1280×720, frames read at full size) and compared it with the party
games people come back to: Smash Bros (knockback that builds, edge-guarding, items), Fall Guys (survival rounds, a camera
that frames the action, cosmetics everyone shows off, daily shows), TowerFall (stomp timing, treasure chests, variants),
Mario Party minigames (one verb, many twists), Party Animals (plush characters that move like puppets).

## Teardown: what is wrong

### It looks cheap
1. **The camera is far and frozen.** The bed takes the middle third of the screen and half the frame is empty floor. A
   monkey is ~55 px tall at 720p (≈25 px on a phone). Nothing ever moves the camera except a tiny shake.
2. **The room is a bare box.** Flat navy walls with stripes, a plank floor with pale rectangles (the moonlight "pools")
   that read as rendering glitches, a guitar made of two spheres, a stack of boxes for books. Nothing lived-in.
3. **The rings look like a shader demo**: a translucent, rainbow-tinted glassy tube with glow, not a fold of quilt. With
   two or three rings out the bed turns into a soup of glowing tubes.
4. **The monkeys are separate spheres and capsules** with visible seams, stick limbs, ball hands, a plastic sheen and
   faces too small to read at game zoom. Every monkey has the same body.
5. **Flat lighting.** Moon shadows barely read, the lamp pool is weak, no bloom on the fairy lights or lamp, no contact
   shadow (things float), no grading. Materials are plain colours with no fabric or wood in them.
6. **The HUD is a dark box with a dashed border** (the "dark box around the HUD" look) holding five identical face icons.
7. **Out monkeys are specks** on a rug at the edge of the frame, mostly off-screen.

### It moves stiffly
8. **No skeleton.** Limbs are rigid sticks rotated around pivots, squash is a scale on the whole group, the tail is a
   fixed curl that wobbles. No anticipation, no follow-through, no secondary motion.
9. **Poses pop.** Arms snap from down to up, mouths swap, the launch spin is a constant-rate rotation that starts at full
   speed.
10. **Falls have no impact.** The monkey drops below the bed and slides (lerps) onto the rug.

### It feels floaty
11. **The slam isn't sold.** A 0.07 s tuck, then a ring: no hit-stop, a small puff, the quilt barely dents, a shake you
    hardly see.
12. **Launches and knock-offs have no weight**: no freeze frame, no camera punch, a 0.45 s slow-down you can't notice.
13. **Bouncing is fully automatic**, so most of the time the player only steers. Nothing happens on the beat of the bounce.
14. **Getting launched feels random**: your height is the only defence and you can't change it.

### Nothing to master, nothing to come back for
15. **One verb with a cooldown.** No resource to build and spend, no timing skill, no risk/reward beyond "slam now".
16. **Round 20 is round 1.** No pickups, no events, no twists except the 40 s wild springs.
17. **Progression ends in an hour**: 5 beds × 3 stars and 7 pyjama patterns. No levels, no collection worth chasing.
18. **No reason to come back tomorrow**: no daily challenge, no daily goals, no streak, no daily board.
19. **The results screen** lists points; nothing levels up, unlocks or celebrates.

## The rebuild

### Depth: one button, more skill
- **Pump the bounce.** Tap as your feet touch the quilt to bounce higher (a trampoline's push). Perfect timing (±55 ms)
  climbs a tier (1.6 → 2.1 → 2.6 → 3.1 u apex), good timing holds it, no tap drops one. An approach ring under your
  monkey shrinks onto your feet as you land: tap when they meet. High = safe from rings and a bigger slam; a slam or a
  launch spends it. The same button still slams when you're high: tap low to pump, tap high to slam.
- **Dizzy stars (knockback that builds).** Every launch adds a star circling your head (max 3); each star makes the next
  launch push 22% further. Stars wear off one per 7 s. A three-star monkey is one ring from the floor: everyone sees it.
- **Toys drop onto the bed** (a shadow first, then the toy): the **golden banana** (your next slam is a Mega Slam, a
  gold ring that reaches and pushes much further), the **pillow** (wear it: it soaks up one launch in a burst of
  feathers), the **spring** (straight to the top tier). Grab one by landing on it: pickups pull you to risky spots.
- **Bedtime twists** from round 2 (same on every page, from the match and round): Pillow Rain, Lights Out, Banana
  Bonanza, Bouncy Springs, Echo Rings. The verse banner names it.
- Bots learn all of it: pumping with skill-based timing, going for toys, running from a golden banana, picking on dizzy
  monkeys.

### Art: a toy-scale stop-motion bedroom
- **Monkeys rebuilt** as one smooth, skinned plush body each (sculpted from soft shapes into a single mesh offline), a
  real skeleton (spine, arms, legs, head, ears, a six-bone tail), plush fur and cotton pyjama materials with sheen and a
  weave, button bead eyes with lids that blink, felt brows, drawn mouths, buttons, collar, cuffs and a symbol pocket.
- **Skeletal animation** authored as clips and blended with AnimationMixer crossfades: rise, fall, land squash, pump
  crouch, star jump, front flip at the top tier, slam tuck and cannonball, launch flail, rim teeter, fall scream, floor
  splat, dizzy sit, pillow throw, cheer and win dances, the guilty freeze. On top: lean into steering, a spring tail,
  floppy ears, a head that looks at the action.
- **The room becomes a real kid's bedroom at night**, at toy scale (1 u = 25 cm): PBR wood floor, plaster and
  wainscoting, a big window with curtains, moonbeam with drifting dust, a nightstand with lamp and alarm clock,
  shelves of toys, a ukulele, a boombox, a rubber duck, books, a knitted rug (CC0 props and textures from Poly Haven).
- **The quilt** gets puffy patches with sunk seams and a cotton weave; rings are folds of fabric that catch the light,
  with a thread of the slammer's colour along the crest and lint kicked up (no glassy tubes).
- **Light and post**: moon key with soft shadows, warm lamp, fairy-light bloom, ambient occlusion, a grade (navy shadows,
  amber highlights), a light tilt-shift depth of field on high quality so it reads as a miniature set.
- **HUD in the world's language**: portraits rendered from the real 3D monkeys on felt circles, dizzy stars and toys on
  them, stitched point tags; no box.

### Feel
- Hit-stop on launches (80 ms) and knock-offs (130 ms), trauma shake with direction, camera punch-in on knock-offs, slow
  motion and a follow cam on the last fall, a camera that frames the living monkeys (closer as the bed empties),
  squash and stretch everywhere, impact dust, quilt lint, feathers, confetti, perfect-pump sparkles.
- Layered sound: sampled soft impacts, creaks, cloth whooshes, door and footsteps (Kenney CC0) under synthesized boings
  that climb the scale with your perfect streak, and music that adds layers as monkeys fall and speeds up when it's wild.

### Reasons to come back
- **Monkey level** (XP for knock-offs, wins, perfect streaks, saves, toys, close calls): every level unlocks something.
- **A wardrobe**: pyjama patterns, hats, slam-ring threads, launch trails and win dances.
- **Tonight's Rush** (daily, the same for everyone): you against an endless line of monkeys climbing onto today's bed,
  three bandages, score = knock-offs with combo bonuses; a daily board and an all-time best.
- **Three nightly goals** (the same for everyone) with XP, and a Bedtime Box (an exclusive cosmetic) for all three; a
  nightly streak.
- The Bedtime Ladder (5 beds × 3 stars) stays; results show XP filling, level-ups, unlocks and goals ticking.

### Order
Sim and bots (pump, dizzy, toys, twists) with tests → the monkey (mesh, rig, clips) → room, quilt and light → effects,
camera and juice → progression, nightly goals and the Rush → screens → sound → netcode for the new pieces → store art,
trailer and docs.
