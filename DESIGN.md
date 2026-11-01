# Five Little Monkeys

3D party game. Vite + three.js, a small physics of its own. Public game, 5 seats, bots in every empty seat.

## The pitch

Five monkeys bounce on one giant bed: slam the mattress and the wave launches the others off. Last monkey jumping wins.

**The goal in one look:** a bed, five bouncing monkeys, a ring rolls across the quilt and one flies off the edge. Stay on,
knock them off.

## How it plays

Every monkey bounces by itself, like on a trampoline (a steady ~1 s rhythm). The player only steers, and has one button:
**SLAM**.

- **Slam** (in the air): the monkey tucks for a blink, then dives straight down where it is. Where it hits, a **ring**
  rolls out across the quilt: a real fold of quilt that rises and travels outward. The higher you were when you pressed,
  the taller, faster and wider the ring.
- **The ring launches whoever it catches low.** If your feet are below the crest when it passes, you are flung up and
  pushed away from the slam (tumbling, mouth wide open). If you are above the crest, it rolls under you: you are safe.
  The crest is tallest near the slam and shrinks as it travels, so far away only a monkey on the mattress gets caught.
- **Two rings crossing add up.** Where crests overlap the fold is taller and the launch stronger.
- **The price of a slam:** you bounce low once afterwards (under every crest) and can't slam again for 1.2 s.
- **Fight back in the air.** A launched monkey can still steer a little (counter-steer toward the middle), and can **slam
  out of a launch**: the dive kills most of its sideways speed and drops it where it is. Over the quilt, that saves you
  (and makes a wave); over the floor, it drops you onto the floor.
- **Off the bed = out.** A monkey whose body is past the mattress edge when it comes down falls to the floor: slide
  whistle, a bonk, a bandage on its head and stars round it ("one fell off and bumped his head"). Each fall plays the
  next verse: the banner "FOUR LITTLE MONKEYS", the melody's line, a beat of slow motion (alone with bots the whole bed
  slows for 0.4 s; with other players only the camera and the faller do, so every page keeps the same clock).
- **Out monkeys keep playing.** They sit on the rug beside the bed with a pile of pillows and throw one every 4 s at a
  spot they aim on the quilt: it lands with a small ring. A pillow that knocks a monkey off scores like a slam.
- **The round can't stall.** At 40 s the springs go wild: the alarm clock rings, the lamp flickers, the music speeds up,
  everyone bounces higher and rings hit harder. At 70 s it gets wilder still.
- **Last monkey jumping wins the round:** "NO MORE MONKEYS JUMPING ON THE BED!" The door bursts open, Mama's silhouette
  stands in the doorway light, and the winner freezes mid-bounce, caught.

## The first minute

| Time | What the screen shows | Hint (once, then gone) |
|---|---|---|
| 0 s | **Title.** The bedroom at night, moonlight through the window, the bedside lamp's warm pool. Five monkeys bounce on the bed, slamming each other; one flies off and bonks on the floor. "FIVE LITTLE MONKEYS" embroidered big at the top, one amber patch button: **PLAY** (Space). Beside it, a small patch with your stars (★ 0/15). | none |
| ~2 s | **Play** (tap, click, Space, Enter) starts the sound. The camera glides to the game view; the bots sit cross-legged on the rug at the foot of the bed with an **Invite** patch at the empty end; your monkey drops onto the quilt and starts bouncing. **Lobby = practice:** Biscuit, a stuffed bear, bounces passively on the bed as a target (each page has its own Biscuit). Top band: the bed patches (only the Kid's Bed open). Bottom: the platform's Ready strip. | "WASD to steer" (touch: "Stick to steer"), over your monkey's name tag, until you steer. Keys or touch is decided by the last input used (before any input: a touch screen without a mouse shows touch) |
| ~4 s | You steer around. | "SPACE to slam" (phone: "Tap SLAM") |
| ~6 s | You slam: whump, the quilt folds into a ring, Biscuit is launched and tumbles off the edge with a bonk, then pops back onto the bed. | "Knock it off!" appears the moment your first ring rolls, if Biscuit is still on |
| ~10 s | You tap Ready. **Countdown** (the game's own, timed to the room): stitched numerals 3, 2, 1 with toy-piano notes, while the four bots hop up onto their spots. "JUMP!" | none |
| ~14 s | **Round 1.** The verse banner unrolls from the headboard: "FIVE LITTLE MONKEYS", the melody's first line. Slams are locked for the first 2.5 s (bots hold theirs for 5 s in a player's first ever round). | "Stay on. Knock them off." under the banner, round 1 only |
| ~16-25 s | First slams. A ring rolls toward you; if it catches you low you fly up spinning. | first two launches: "Steer back!". First two launches toward an edge: "SPACE to drop!" (touch: "Tap SLAM to drop!") |
| ~20-35 s | First fall (usually a bot): slide whistle, bonk, bandage, stars. Banner "FOUR LITTLE MONKEYS", under it "RUMBLE bonked PIP" in their colours ("pillowed" for a pillow, "fell off" with no credit, "dozed off" for a player who went away); a "+1" flies from the faller to Rumble's plush on the strip. The faller's plush tips over. The cause stays on screen: the knocker's ring is drawn in its colour, and a launched monkey trails its knocker's colour. | none |
| ~40 s | Wild springs: the alarm clock rings, the lamp flickers, the music jumps tempo, everyone bounces a metre higher. Banner "WILD SPRINGS!" | none |
| ~45-60 s | The final two. The last fall: "NO MORE MONKEYS JUMPING ON THE BED!", the door bursts open, light wedge, Mama's silhouette, the winner frozen mid-bounce. "+3" and "+1"s fly to the strip. | none |
| If you fall first | You land on the rug (bonk, stars), then a pillow appears in your hands and a stitched target circle appears on the quilt. The phone's button now reads "Throw". | "SPACE to throw pillows" (touch: "Throw pillows!") |

## Controls

| | Keyboard | Phone (platform controls) |
|---|---|---|
| Steer (in the air) / aim a pillow when out | WASD or arrows | the platform stick, `stick: 'analog'` (exact direction and speed) |
| Slam / throw a pillow when out | Space (Enter also works) | one big button, `{ id: 'slam', label: 'Slam', key: ' ' }`, relabelled "Throw" when out (same id, so it stays held) |
| Lobby: pick a bed, rounds, your pyjamas (host picks bed and rounds) | click / tap the patches | tap the patches |

Mouse not needed in play. No other buttons. `ow.controls.set(null)` on the title and results; the stick and Slam are on
in the lobby (practice), the round, and while out.

## The core loop and where mastery comes from

Every second: watch the rings, keep your monkey where a push won't carry it off, and pick the moment to slam.

**A beginner** steers to the middle and slams when someone is near. Gets launched by rings they didn't see coming.

**An expert:**
- **Times the slam to the target's bounce.** The ring takes `distance / speed` to arrive (2 u at 8 u/s = 0.25 s), plus
  the 0.16 s dive: press as the target starts down, and the crest meets them on the mattress.
- **Picks the height.** A slam from the top of the bounce is the biggest ring; a quick low slam is small but comes early
  and catches someone off guard.
- **Plays the edges.** A monkey near the frame needs only a small push. The rim of the mattress is soft: monkeys bounce
  lower there (and so are easier to catch).
- **Reads incoming rings and jumps them.** Your bounce is automatic, but where you stand decides *when* a ring reaches
  you: stepping toward a slam takes its crest early, stepping away takes it late. At 3.4 u/s that shifts the arrival by
  up to ±0.2 s, enough to be at the top instead of the bottom.
- **Saves itself.** Counter-steers in a launch, and slams out of a launch toward an edge (the save slam). Knows the save
  is impossible right after its own slam (cooldown) and in the first 0.25 s of a tumble, and hunts others in those
  windows.
- **Crosses waves.** Slams just after someone else so the two crests meet under a target (interference).
- **Baits.** Hovers near an aggressive monkey so it slams first (and bounces low, with no save), then punishes.
- **Uses the pillows** when out: drops a small ring under the leader, or decides the final duel.
- **Targets the leader**, who wears the nightcap (see Progression).

## Solo

Solo is the full game: a player alone readies in the lobby and the four bots fill the bed.

**The bots** are four monkeys with names, looks and personalities of their own (no "BOT" tags):

| Name | Pyjamas (colour, pattern, symbol) | Personality |
|---|---|---|
| **Rumble** | tomato red, bold stripes, ■ | Reckless slammer. Slams on half a chance, plays the middle hard, careless about edges. |
| **Tiptoe** | sky blue, polka dots, ● | Cautious edge-dodger. Keeps 1.8 u from every edge, slams only on sure things, the best at jumping rings. |
| **Mimic** | leaf green, zigzag, ▲ | Copycat. Slams 0.25-0.4 s after any slam it sees nearby to cross the crests; shadows the player's position. |
| **Dozy** | sun yellow, stars, ★ (sleep mask pushed up) | Sleepy: slow and passive for the first 40 s, then wakes up with the wild springs and makes monster slams from the top of the big bounces. |

**The Bedtime Ladder:** five beds, unlocked in order. Win a match on a bed to unlock the next. Each bed has its own
physics, its own room, and sharper bots:

| # | Bed | Size (u) | What's different | Bot skill |
|---|---|---|---|---|
| 1 | **Kid's Bed** (a kid's room) | 6 × 8 | The base game. Headboard at the back (a padded wall). | 0.30-0.50 |
| 2 | **Bunk Bed** (an L-shaped bunk in a shared room) | top bunk 5.2 × 2.6 at height 1.25, lower bunk 7.2 × 5.6 in front of it | Two levels. Falling off the top bunk's front edge lands you on the lower bunk, not out. From the lower bunk you can climb up by steering into the top bunk at the top of a bounce. A slam that dives off the top bunk onto the lower one counts the whole drop: a monster ring. | 0.40-0.60 |
| 3 | **Water Bed** (Grandpa's 70s den) | 7 × 8 | Slow, rolling rings (speed ×0.65, height ×1.05, reach ×1.2) that **bounce back once** off the frame (at 40%). A slow swell lifts and lowers everyone's bounce by ±19%. | 0.50-0.70 |
| 4 | **King Bed** (a hotel suite) | 9 × 8 | Satin: slippery. Steering is weaker (accel 8 instead of 14) and you slide on (decel 2 instead of 8); pushes ×1.2. Four big pillows by the headboard: landing on one bounces you low (apex ×0.6). | 0.60-0.80 |
| 5 | **Four-Poster** (Grandma's attic) | 7 × 7 | Springy posts at the corners (they kick you back). A canopy over the bed: a head that reaches it (feet 1.85 u above the quilt) bonks and drops, so heights (and rings) are capped, and the wild springs bonk everyone off the canopy. Pushes ×1.3. | 0.70-0.90 |

**Stars:** three per bed (15 in all): ★ win a match on it; ★ **Untouchable**: win a round without being launched once;
★ **Quick**: win a round in under the bed's time (Kid's 30 s, Bunk 35 s, Water 40 s, King 35 s, Four-Poster 35 s; set
from simulations so a good player gets it in about one win in five).

**How long it lasts:** a match is about 3 minutes. Clearing the ladder takes 10-15 matches (30-45 min); all 15 stars and
every pattern a few hours; the knock-off and fastest-win boards after that.

## Multiplayer

- **Public game**, rounds. `ow.rooms.join({ maxPlayers: 5, minPlayers: 1, lobby: 'bar', ownCountdown: true, settings })`,
  once, on load. Five fits the rhyme. `minPlayers: 1`: a lone player readies and plays with bots. The platform's
  private servers and invites cover friends; the game has no server menus.
- **Settings** (declared, drawn by the game in its lobby, changed by the host with `room.setSetting`):
  `bed` (`kid`, `bunk`, `water`, `king`, `poster`; default `kid`) and `rounds` (3 or 5; default 3). The host can only pick
  beds their own ladder has unlocked; everyone plays the bed the host picked, unlocked or not, and earns its stars.
- **Lobby and ready-up:** the game draws the lobby (the bed itself, everyone bouncing on it, names and ready checks over
  their heads, the bed and rounds patches); the platform adds the Ready/Start strip (`lobby: 'bar'`). Public servers
  start on the room's countdown once everyone is ready; private servers wait for the host's Start (`room.canStart`).
  Joining never starts anything. The game draws its own 3-2-1 from `room.match.startsAt` (one countdown on screen).
- **Match:** `createMatch` with `rounds: 'rounds'`, `introSeconds: 0`, `roundEndSeconds: 5.5`, `admit: 'round'`,
  `resultsSeconds`: 20 in a public server, 25 alone, 0 in a private one (the host's Next). No round time limit in the
  helper: the host ends each round by the rules below. A participant whose page is on the title when a match runs
  (a reload, a late Play) goes straight to the game screen.
- **Scoring:** round winner (last monkey jumping) **+3**; every knock-off **+1** to whoever launched the faller (a slam
  or a pillow, credited if the fall comes within 3 s of that launch; walking off on your own scores nobody). Most points
  after 3 (or 5) rounds wins; ties share the place. If 90 s pass with more than one monkey on the bed, Mama comes in
  anyway: every survivor gets +1, no winner.
- **Bots** fill every empty seat up to 5 (`createBots`, `fill: 5`, the four names above). They run only on the host's
  page, through the same physics, cooldowns and messages as players. A player admitted at the next round takes a bot's
  seat. Seat colours: each bot keeps its own colour; players take violet (◆) first, then the colours of the bots not
  seated.
- **Latecomers** watch the round from the rug at the foot of the bed, under a "Next round" tag, and take a bot's seat at
  the next round (`admit: 'round'`).
- **Leavers:** a participant away (or gone) for more than 3 s during a round is counted as fallen, kindly ("PIP dozed
  off", no credit). Their points stay. A reload brings them straight back: on the rug with pillows for the rest of that
  round, on the bed at the next one; never stuck watching a whole match.
- **Host change:** the match record is the helper's; the round's falls live in `match.data`. The new host takes the
  bots over from where every page already predicts them, and goes on. A host that reloads puts its own monkey and the
  bots back where its last presence had them.
- **Solo pause:** when you are the only player, the platform menu or a hidden page pauses the bed (the bed's clock and the
  bots stop, a "Paused" patch with Resume). With other players nothing pauses.

### Netcode

Each page is the authority on its own monkey; the host is the authority on bots, falls, rounds and points.

- **Presence (20 Hz, under 300 bytes):** `{ v: 1, s: state (title, lobby, in, watch), r: round id ('L' in the lobby),
  t: sim time of the sample, p: pyjama pattern, m: sample }`, a sample being `[mode (c contact, a air, l launched,
  f falling, o out), x, z, y, vx, vz, vy, ix, iz (steer), tc, low, launches, aimX, aimZ (pillow aim), surface]`, numbers
  rounded to 0.01. The host's presence also carries the bots: `b: [[seat, ...sample], ...]`.
- **Remote monkeys are predicted, not trailed:** from each sample the page runs the same pure physics forward to now
  (the bounce arc is deterministic, the steer input held), and blends any correction out over 120 ms. Remote monkeys
  are drawn in the present, so rings and bodies line up on every screen.
- **A slam is sent at the press, before it lands.** The dive is deterministic (steering locked, sideways speed ×0.2),
  so the pressing page computes the impact point and time and sends `{ t: 's', n, x, z, e, at }` at once; the wind-up and
  dive (0.12-0.2 s) cover the network delay, so every page starts the ring on time. Receivers also play the dive on that
  remote monkey.
- **A pillow** is `{ t: 'p', n, fx, fz, x, z, at }` with its landing time 0.6 s ahead: every page draws the same arc and
  ring.
- **Rings are pure functions** of (centre, energy, start time, bed). Clock: `room.matchNow()` in a match,
  `ow.now()` in the lobby.
- **The victim decides its own launch** from the rings it knows, checking its own last 250 ms of positions when a ring
  message arrives late. Its launch shows on other screens through its presence (~100 ms).
- **Falls:** the faller's page calls `host.rpc('fall', { rid, by, at, kind })` (`by`: the seat whose ring or pillow
  launched it within 3 s). Bots' falls are queued on the host and written from its tick. The host's referee
  (`referee.js`) checks the round id, that the seat is alive, that `by` is a seat that slammed or threw in the 4 s before
  the fall, and appends to `match.data.falls`. When one monkey is left (or at 90 s) it ends the round with the points
  as its outcome. Out is final for the round: a late sample can't put a fallen monkey back on the bed.
- **Wild springs and overtime** are read from round time on every page (`match.elapsed`): nobody sends them.
- **Validation** (`protocol.js`) of every message and presence: finite numbers within the room (the bed ±3.5 u), a
  slam's centre on its surface, energy 0.3-1.8, `at` from 0.8 s before to 0.9 s after this page's clock, one slam per
  seat per 0.9 s, one pillow per 3.3 s, steering within a unit, patterns known, bot rows capped at 5. During a round only
  seats may act (a latecomer's slams are refused), pillows only in a round, bots' messages only from the host. Anything
  else is dropped. Names are drawn as text only.
- Rewards are cosmetic: a page that refuses to be launched spoils its own fun, not anyone's prize.

## Progression and reasons to come back

- **The ladder:** 5 beds to unlock, 15 stars (above).
- **Pyjamas:** your pattern, worn on your seat's colour, picked in the lobby. Plain to start; Stripes at 2 stars, Polka
  at 4, Checks at 6, Moons at 9, Lightning at 12, Gold Stars at 15.
- **The nightcap:** during a match the leader on points wears a red nightcap with a pom-pom, so everyone knows whom to
  hunt.
- **Personal bests** (title and results): stars, match wins, knock-offs, fastest round win per bed.
- **Leaderboards:** `knockoffs` (lifetime knock-offs), `wins` (lifetime match wins), `fastest-kid`, `fastest-bunk`,
  `fastest-water`, `fastest-king`, `fastest-poster` (fastest round win in seconds, lower is better). The results show
  your place when you set a best.
- **Badges** (10):

| id | Name | Earned |
|---|---|---|
| `first-slam` | First Slam | Slam the mattress. |
| `bumped-head` | Bumped His Head | Fall off the bed. |
| `double-bounce` | Double Bounce | Knock two monkeys off with one slam. |
| `no-more-monkeys` | No More Monkeys | Win a round. |
| `untouchable` | Untouchable | Win a round without being launched. |
| `pillow-fight` | Pillow Fight | Knock a monkey off with a pillow. |
| `saved-it` | Saved It | Slam out of a launch and stay on the bed. |
| `bunk-boss` | Bunk Boss | Win a match on the Bunk Bed. |
| `making-waves` | Making Waves | Win a match on the Water Bed. |
| `five-beds` | Five Beds | Win a match on every bed. |

- **Save** (`ow.save`, one key): stars per bed, wins, knock-offs, bests, pattern, last bed, hints already shown, whether
  the first round has been played.

## Balance and timing

Units: 1 u ≈ a monkey's height. Simulation at a fixed 120 Hz with an accumulator.

| | Value |
|---|---|
| Gravity | 16 u/s² |
| Bounce apex | 1.6 u (period ≈ 1.0 s: 0.89 s in the air + 0.12 s in the mattress); wild (40 s, ramps over 3 s) 2.6 u (≈ 1.26 s); overtime (70 s) 3.0 u |
| Steering | max 3.4 u/s, accel 14 u/s², decel 8 u/s² when let go |
| Launched (tumbling) | steering accel 2.5 u/s², drag 0.3/s, no slam for the first 0.25 s |
| Mattress rim | outer 0.35 u: bounce ×0.8 and a teeter animation |
| Fall | body centre more than 0.15 u past the mattress edge when the feet drop below the quilt |
| Headboard / walls | bounce back with restitution 0.5 |
| Slam | from 0.35 u up; wind-up 0.07 s (hang, tuck); dive at 14 u/s with gravity ×3; sideways speed ×0.2 at the press; cooldown 1.2 s from impact; rebound 0.85 u once |
| Slam energy | E = height above the landing surface ÷ 1.6, clamped 0.3-1.8 |
| Ring | speed 5.5 + 2.5E u/s (E=1: 8); reach 2.6 + 2.4E u (E=1: 5); crest A0 = 0.45 + 0.55E u (E=1: 1.0), height at radius r: A0 · (1 − r/reach)^0.8, rising over the first 0.6 u; half-width 0.55 u. E=1 crest: 0.84 u at 1 u, 0.66 at 2, 0.48 at 3, 0.28 at 4 |
| Launch | k = crest heights summed under you (crossing rings add), depth q = 1 − feet height ÷ k; strength s = k (0.55 + 0.45q), max 1.8; launch apex 1.0 + 1.6s u (max 3.6); push 4.0s u/s outward. E=1 slam, victim 1 u away on the mattress: apex ≈ 2.3 u, about 2.5 u of travel uncountered, about 1.5 u with a counter-steer |
| Wild / overtime | crest ×1.2 / ×1.4, push ×1.15 / ×1.3 |
| Pillow | every 4 s (first 2 s after landing on the rug), flight 0.6 s, aim speed 5 u/s, ring of E = 0.5 |
| Round | grace 2.5 s (no slams; bots 5 s in a player's first round); wild 40 s; overtime 70 s; Mama at 90 s; away 3 s = out |
| Match | 3 or 5 rounds; round end 5.5 s; results 20 s public, 25 s alone |
| Bots | reaction 0.42 − 0.27·skill s; error in reading others' heights σ = 0.45 (1 − skill) u; save slam with probability = skill; slight preference for the nightcap |

**Targets** (node tests: `test/balance.test.mjs` plays 150-300 seeded rounds per case with five bots,
`test/room.test.mjs` plays whole matches through a fake room):
- rounds: median 35-55 s, 90% under 75 s, every one ends by 90 s; first fall median 4-20 s;
- at least 75% of falls credited to a slam or pillow (falls come from play, not drifting off); pillows at most 30% of them;
- the cast at a bed's middle skill: each bot wins 8-40% of rounds;
- no spawn or seat advantage: equal bots each win 13-27%;
- skill matters: one 0.9 bot against four 0.4 bots wins ≥ 30% of rounds and ≥ 1.4× their points; a 0.4 bot still wins;
- a beginner (careless slammer, skill 0.1) wins 10-40% against the cast on the Kid's Bed;
- Dozy: more of his knock-offs come after the wild springs or with three left than before;
- no refuge: a bot that camps and never slams wins ≤ 32% and scores fewer points than the active bots;
- nothing is NaN, every round ends, every credit names a seat that acted in the 4 s before the fall.

**Measured** (Kid's Bed, 400 rounds each): the cast plus a pro: median round 46 s, 90% by 54 s, first fall at 8 s,
every fall credited, pillows 19% of knock-offs; wins Dozy 27%, Tiptoe 20%, pro 20%, Mimic 18%, Rumble 16%. A beginner
(skill 0.1) against the cast at the bed's skill wins 22% (Dozy 32%, Mimic 17%, Tiptoe 17%, Rumble 12%). Whole 3-round
matches over every bed through the fake room: rounds average 49 s. What the bots show: pressure pays. A careless
slammer at a pro's skill beats careful pros (37% of rounds), so the lesson the game teaches is the one on the banner,
"Stay on. Knock them off.": be near the others, slam from the top of your bounce, keep off the edges.

## Every screen

All panels are quilt patches (see Art direction). Nothing sits in the top-left 150 × 70 px or any `ow.ui.reserved` area;
everything lays out again on `ow.on('reserved')` and resize.

1. **Title.** The live bedroom (bots playing on the last bed you played), the name embroidered large across the top
   third, the PLAY patch (amber, 64 px tall on phones, "Space" key mark) in the lower middle, and beside it a small patch:
   ★ stars and your best. Nothing else.
2. **Lobby.** The bed fills the screen; your monkey bounces (practice) with Biscuit the bear; other players bounce too,
   their names (white, plum outline) and a ready check in a felt circle over their heads, a small key over the host.
   Falling off in the lobby just pops you back onto the quilt. Unfilled seats: bot monkeys sitting on the rug at the
   foot of the bed, with an **Invite** patch beside them (`ow.ui.showInvite()`). Top band: five bed patches (picture of the bed, its name, its 3 stars, a stitched padlock when
   locked; the chosen one raised), the rounds patch (3 / 5), and your pyjama patch (a swatch; tap to cycle). Only the
   host's patches respond; the others show the host's choice. Bottom: the platform's Ready strip.
3. **Countdown.** Stitched numerals 3, 2, 1 drop onto the quilt with a puff; "JUMP!".
4. **Play.** The bed, nearly edge to edge. Top centre: **the monkey strip**, a stitched band with five plush heads in
   seat colours, each with its symbol, the player's name under it (cut to 8 letters) and the match points on a felt tag;
   a fallen monkey's plush tips over with a bandage. To its right, **the alarm clock**: its hand sweeps to a red WILD
   wedge at 40 s, the round's dots on its base. (On a portrait phone the strip sits below the platform's buttons and the
   clock joins its right end.) In the world: your monkey's ring of light on the quilt under it in your colour, with the
   slam cooldown as an arc that fills; a blob shadow under every monkey that shrinks as it rises (high = safe); the
   verse banner unrolling from the headboard; hints near your monkey.
5. **Out.** Your monkey on the rug with a pillow; a stitched target circle on the quilt (your colour) with a pie that
   fills as the next pillow is ready.
6. **Watching** (latecomer). The round as everyone sees it; your monkey on the rug with a "Next round" tag.
7. **Round end** (5.5 s). The door bursts open, light wedge across the bed, Mama's silhouette, the winner frozen
   mid-bounce, the banner "NO MORE MONKEYS JUMPING ON THE BED!". Then the points fly: +3 from the winner, +1s from
   each knock-off, onto the strip's tags; the nightcap moves to the leader's head.
8. **Results.** The winner bouncing alone on the bed in a burst of pillow feathers, the others on the rug. A big quilt
   patch: places 1-5 (avatar head for players, plush head for bots, name, points), then your line: stars earned this
   match popping in (★ Untouchable), "Bunk Bed unlocked" stitched on as a new patch, a new best with its board place.
   One button: **Play again** (Enter; readies you, and skips the wait if you're the host). After the timer, the lobby.
   On a short landscape phone the card sits on the right and the winner stays in view on the left.
9. **Paused** (solo only). One patch, "Paused", **Resume**.
10. **Room closed.** One patch, one button: "You were removed" + Play; "Disconnected" + Rejoin; "Playing in another
    tab" + Play here. Each calls `rooms.join` again with the same options.

## Art direction

**The world:** a kid's bedroom at night built like a stop-motion set: quilted cotton, felt, painted wood, fairy lights,
moonlight. Two-light drama: cool moonlight from the window throws long window-pane shadows across the quilt; the
bedside lamp pours a warm amber pool. Cool kid's room, not a nursery: a skateboard, sneakers, a guitar, rocket posters,
fairy lights along the headboard. Each ladder bed re-dresses the same room shell: bunk room (glow stars on the ceiling),
Grandpa's den (wood panelling, a lava lamp, shag rug), a hotel suite (city lights in the window, crimson and gold), Grandma's
attic (florals, lace canopy, a grandfather clock).

**Palette:**

| | Hex | Use |
|---|---|---|
| Midnight | `#172036` | room shadows, panels |
| Moon blue | `#8FB8FF` | moonlight, cool highlights |
| Lamp amber | `#FFB24A` | warm light, the main accent, Play |
| Quilt red | `#D9473B` | the quilt's lead fabric, WILD, the nightcap |
| Cream thread | `#FFF1D6` | text, stitches |
| Plum ink | `#2B1B33` | text outlines, deep shadow |

Seat colours (pyjamas, always with their symbol): red `#E5483C` ■, blue `#3C86F0` ●, green `#39B86E` ▲, yellow
`#F6C239` ★, violet `#9C6CF0` ◆. Fur `#6A4530`, face `#E8C39E`.

**Fonts** (self-hosted with @fontsource, OFL): **Alfa Slab One** for every big word and numeral (title, banners, countdown,
points), embroidered on the patches; **Barlow Condensed** 700 for names and small labels. Canvas text waits for
`document.fonts.load` (with a timeout).

**The signature element: the stitched patch.** Every UI surface is a quilt patch from the bed's own fabrics, with a cream
running-stitch border, a puffy edge and a soft shadow: the title, the buttons, the monkey strip, the results, the bed
picker. The verse banner is a long strip of the same quilt that unrolls from the headboard with the words embroidered on
it. No glass, no gradients, no pills, no dark boxes behind HUD items.

**The quilt is the star:** big patchwork squares (gingham, stripes, dots, corduroy, a floral) generated on a canvas with
sunk seams, on a plane of ~12k vertices displaced in the vertex shader by the same ring and dent functions the physics
uses (up to 12 rings, 6 slam dents). Each ring glows in its slammer's colour with a cream core, so who made it reads at
a glance. The crest catches the lamp light as it rolls; the quilt's overhang ripples too.

**Monkeys:** drawn 1.4× the physics body's size so they read on a phone, built in code from smooth primitives: lanky,
long curling tails (tube along an animated spring curve), heads about 40% of the height (not babyish), half-lidded mischievous eyes with brows, a wide mouth. Pyjamas: button-up top and
cuffed trousers in the seat colour with the pattern, the seat symbol on the chest pocket. Animation does the acting:
squash on landing, stretch in flight, a tuck and gritted teeth on the slam, an "O" mouth and a spin when launched, arms
windmilling on the rim, swirly eyes then a bandage and three orbiting stars on the floor, a guilty grin frozen when the
door opens. The leader wears the nightcap. Mama is a flat backlit silhouette in the doorway: curlers, hands on hips.

**Lighting and camera:** three-quarter view from the foot of the bed, about 38° down (steeper and higher in portrait),
framed from the bed's box by aspect and the HUD's measured edges so the whole bed always fits; at the round end it
pulls back to take in the door; trauma² shake on slams scaled by energy (none with reduced motion). Moon: directional
light with soft shadows (tight shadow camera round the bed; map 0 / 1024 / 2048 by quality). Hemisphere fill (navy / plum). Lamp: warm point
light. Door: a spot only at the round end (high quality). A blob shadow under every monkey at every quality (it shows
height and position over the quilt; over the floor it drops away, which is the warning). ACES tone mapping, sRGB, navy
fog.

**HUD in the world's language:** the plush strip, the felt alarm clock, the embroidered banner, stitched numerals;
hints in white with a plum outline next to your monkey.

`ow.ui.setLook({ accent: '#FFB24A', panel: '#172036', text: '#FFF1D6' })`.

## Sound

Synthesized Web Audio, all of it.
- **Bounce:** a springy boing, pitch by height, quiet for other monkeys.
- **Slam:** a click on the tuck, then a deep whump (60→35 Hz sine with a noise thump) and a mattress creak; bigger slams lower and louder.
- **Ring:** a rising filtered-noise whoosh that follows the ring outward.
- **Launch:** a thwap and a slide whistle up; tumbling: a wobble.
- **Rim teeter:** a wah-wah wobble.
- **Fall:** slide whistle down, a wooden bonk, a bell-like "bonng", three tiny star chimes.
- **Pillow:** a whoosh and a soft fwump.
- **Save slam:** the whump plus a two-note "phew" ding.
- **Verse:** each fall plays the next line of the tune on toy piano.
- **Wild springs:** the alarm clock's bell and a chord of spring twangs; the lamp's flicker buzz.
- **Round end:** footsteps, a door bang, a held chord; results: a fanfare on toy piano and xylophone.
- **UI:** a soft felt tap for patches, a stitch "zip" for banners.
- **Music:** a small sequencer: a bouncy tune written for the game in the rhyme's chanting rhythm, on xylophone and toy
  piano over a pizzicato bass and a brushed snare. 116 bpm in play, 140 when the springs go wild; a slow music-box version
  on the title and lobby, quieter.

## Store art and the trailer

- **Cover** (`thumb-1`): five monkeys mid-air over a rippling quilt, a ring rolling out from a slam under them; moonlight
  and the lamp pool; "FIVE LITTLE MONKEYS" embroidered once, big.
- **Action** (`thumb-2`): low angle, a crest lifting the quilt patches and flinging a monkey at the camera.
- **Win** (`thumb-3`): the door open, the light wedge, Mama's silhouette, the winner frozen mid-bounce in the nightcap,
  bandaged monkeys on the rug.
- **Multi** (`thumb-4`): the final duel: two monkeys on the bed and a ring between them, the three that fell on the rug
  with their pillows.
- **Icon:** one monkey in striped pyjamas at the top of a bounce over a ring of quilt, on midnight; no text.
- **Badges:** a bold symbol on a coloured felt disc each (a fist on a ring, a bandage, two monkeys, a door, a shield, a
  pillow, a down arrow, bunk beds, a wave, a bed with five stars).
- **Trailer** (26 s, real play with its own sound, autoplay captures): frame 0 is a slam ring rolling through the
  monkeys; "FOUR LITTLE MONKEYS" by 3 s; the wild springs; three left; the Water Bed's slow rolling rings; the last
  fall, "NO MORE MONKEYS JUMPING ON THE BED!" and Mama in the door; the last 3 s the title over the bed in play.

## Originality check

It resembles knock-off party games (sumo rings, Gang Beasts, Fall Guys' survival rounds) and the shockwave jump of
platformer boss fights. What a player notices in the first minute that's different: you never press jump, everyone is
bouncing all the time, and your one move is the slam, whose ring you watch fold across a real quilt; your defence is being
in the air at the right moment. The rhyme is the scoreboard: each fall is a verse, the plushes count the monkeys down, and
Mama ends every round.

## Tech

- `game/` holds `index.html`; Vite builds to `dist` (`"dir": "dist"`), `base: './'`.
- Pure modules (no DOM, no three.js, no SDK; node-tested): `sim/config.js` (every number), `sim/beds.js` (bed shapes and
  physics settings), `sim/waves.js` (rings, pillows, reflections, the surface height), `sim/body.js` (a monkey's bounce,
  steering, slam, launch, falls), `sim/brain.js` (the bots), `sim/round.js` (falls, credit, points, round end),
  `sim/arena.js` (a whole round of bots, for the simulations and posters), `sim/rng.js`; `world.js` (the bed as a page
  runs it: its own monkey, the host's bots, predicted remote monkeys, rings from messages), `protocol.js` (every check
  on what other pages send, and the messages this page sends), `referee.js` (the host's rulings).
- Around them: `net.js` (room, match, bots, messages, presence through the SDK), `view.js` and `render/` (scene and
  camera, room, quilt shader, monkeys, effects, textures), `ui.js` and `style.css` (patches, HUD, lobby, results),
  `input.js`, `audio.js`, `save.js`, `look.js`, `poster.js`. `?autoplay=1` (local hosts only) lets the bot brain play
  the local seat for captures; `?debug` (local only) shows the frame's draw calls.
- Join first, then build the scene. Pause on `visibilitychange`. Static room geometry is merged by material; fairy
  lights and blob shadows are instanced: 134 draw calls in the lobby (measured with `?debug`).

## Risks

- **Rings feel random.** The crest is drawn tall and sharp with a moving highlight, the slammer tucks visibly before the
  dive, the blob shadow shows everyone's height, and the first launches teach "Steer back!" and "SPACE to drop!"
  (touch: "Tap SLAM to drop!"). The simulations check that skill wins.
- **Latency.** Slams are sent at the press with their impact time 0.12-0.2 s ahead; remote monkeys are predicted to the
  present; the victim judges its own launch, including rings that arrived late.
- **Small monkeys on a phone.** The camera fits the bed by aspect; monkeys are drawn 1.4× and are about 40 px tall on a
  390 px wide portrait screen; your ring of light marks you. In a short landscape phone the bed is height-bound and
  smaller (about 25 px monkeys): playable, but portrait is the better phone view.
- **Camping** (the headboard, the top bunk). Rims are soft, pillows are low, rings reach everywhere by wild time; the
  simulations cap a camper's win rate.
- **Bunk Bed readability.** An L-shaped bunk (the top bunk across the back, the lower one in front) instead of stacked
  bunks, so nothing is hidden under a mattress.
- **Scope.** The Kid's Bed is built completely first (play, bots, netcode, every screen); the other four beds are
  settings plus a re-dressed room on the same code.
- **Mama.** A comic silhouette and a door bang, never scary.

## Changes from the spec

- **Fixed rounds with points instead of first to 3 round wins.** With five players, first-to-3 runs 3 to 11 rounds
  (3-10 min). A fixed 3 (or 5) rounds keeps a match near 3 (or 5) minutes, and +1 per knock-off rewards the slam game and
  keeps a monkey that fell early (throwing pillows) in the race. The round's goal is unchanged: last monkey jumping.
- **The slam doubles as the save** (slam out of a launch to drop where you are). Same button, same meaning, and it gives
  defence a skill beyond being lucky with your bounce.
- **The lobby is practice** on the bed with a target bear, so the controls are learned before the first round.
- **The Bunk Bed is L-shaped**, so both levels stay visible from the camera.
- **The cause of every knock-off is on screen**: rings glow in the slammer's colour, a launched monkey trails its
  knocker's colour, and the verse names both ("RUMBLE bonked PIP"). Credit goes to the monkey whose ring or pillow last
  launched the faller within 3 s.
- **Height reads at a glance**: a blob shadow under every monkey shrinks as it rises, so "high enough to be safe" is
  visible, and the monkeys are drawn 1.4× so they read on a 390 px phone.
