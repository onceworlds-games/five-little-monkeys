// The screens, cut from felt and sewn: felt-pillow buttons with a running stitch, portrait discs of the real plush monkeys
// with their dizzy stars, toys and stitched point tags, a felt alarm clock, ribbon banners, and the cards for the title,
// the wardrobe, the results (XP counting up, level-ups, unlocks, goals, the Bedtime Box) and Tonight's Rush.
// Plain DOM. Every name shown comes from players: it is set as text, never as HTML.
import { sfx } from './audio.js';

const el = (tag, cls, parent, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
};

const NS = 'http://www.w3.org/2000/svg';
/** An inline SVG from [tag, attrs] parts (built as elements: no markup parsing). */
function svg(viewBox, parts, cls) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('fill', 'currentColor');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  for (const [tag, attrs] of parts) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    s.appendChild(e);
  }
  return s;
}
const r = (x, y, width, height, rx = 0) => ['rect', { x, y, width, height, rx }];
const P = (d, extra = {}) => ['path', { d, ...extra }];
const stroke = (d, w = 2.4) => P(d, { fill: 'none', stroke: 'currentColor', 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
const BED_SVG = {
  kid: [r(2, 8, 30, 7, 2), r(2, 3, 5, 12, 1.5)],
  bunk: [r(2, 10, 30, 5, 2), r(2, 2, 18, 5, 2), r(2, 2, 3, 13)],
  water: [P('M2 9 q4 -3 8 0 t8 0 t8 0 t6 0 v6 h-30z'), r(2, 4, 4, 11, 1.5)],
  king: [r(1, 8, 32, 7, 2), r(1, 2, 6, 13, 2), r(9, 5, 7, 3, 1.5)],
  poster: [r(4, 9, 26, 6, 2), r(3, 1, 2.5, 14), r(28.5, 1, 2.5, 14), r(3, 1, 28, 2)],
};
const STAR = P('M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.9l6-.7z');
const dot = (cx, cy) => ['circle', { cx, cy, r: 0.9, fill: '#00000040' }];
const ICONS = {
  star: [STAR],
  check: [stroke('M3.5 10.5l4.2 4.2L16.5 5.8', 3)],
  key: [['circle', { cx: 6.5, cy: 10, r: 4.2 }], r(9, 8.6, 9, 2.8, 1), r(14, 8.6, 2.6, 6, 1)],
  moon: [P('M12.5 2.2a8 8 0 1 0 5.3 13.4A7 7 0 0 1 12.5 2.2z')],
  gift: [r(3, 9, 14, 9, 1.5), r(2, 6, 16, 4, 1.5), P('M10 6C8 2 4.5 2.5 5 5c.3 1 2 1 5 1zM10 6c2-4 5.5-3.5 5-1-.3 1-2 1-5 1z'), ['rect', { x: 9, y: 6, width: 2, height: 12, fill: '#00000055' }]],
  lock: [r(4, 9, 12, 9, 2), stroke('M7 9V6.5a3 3 0 0 1 6 0V9', 2.4)],
  banana: [P('M3.5 13.5c4.5 2.2 9.5.5 12.4-6.4.4-.9 1.8-.8 1.6.3-1.3 7-8.6 11-14.6 7.9-.9-.5-.4-2.2.6-1.8z')],
  pillow: [P('M3 6.5q7-3 14 0 1.4 3.5 0 7-7 3-14 0-1.4-3.5 0-7z')],
  hanger: [stroke('M8.2 5.6a1.9 1.9 0 1 1 2.6 1.8v1.4l7 4.6c.6.4.3 1.4-.4 1.4H2.6c-.7 0-1-1-.4-1.4l7-4.6', 2)],
  bandage: [P('M3.5 12.2l8.7-8.7a3 3 0 0 1 4.3 4.3l-8.7 8.7a3 3 0 0 1-4.3-4.3z'), dot(9.3, 9.2), dot(11, 10.9), dot(11, 7.5), dot(7.6, 10.9)],
  crown: [P('M2.5 15.5l1-9 4 4 2.5-6 2.5 6 4-4 1 9z')],
  shirt: [P('M6.5 2.5L2 5.5l2.2 3.4L6 8v9.5h8V8l1.8.9L18 5.5l-4.5-3c-.8 1.8-6.2 1.8-7 0z')],
  hat: [P('M3 15.5c1.8-6 6.5-11.5 13.5-11.5-3 3.2-3.2 7.3-2.2 11.5z'), ['circle', { cx: 16.4, cy: 4.2, r: 2.3 }], r(2, 14.6, 14, 3.4, 1.7)],
  thread: [stroke('M3 17L15.5 4.5', 2.2), ['circle', { cx: 16.2, cy: 3.8, r: 1.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }], stroke('M3 10c3-3 5 3 8 0s5 3 6 1', 1.6)],
  trail: [P('M10 1.5c.6 4 2.4 5.9 6.5 6.5-4.1.6-5.9 2.5-6.5 6.5-.6-4-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.5 6.5-6.5z'), ['circle', { cx: 4, cy: 16, r: 1.6 }], ['circle', { cx: 16.5, cy: 15.5, r: 1.1 }]],
  dance: [P('M8 15.5a2.6 2.6 0 1 1-1.2-2.2V4.1l9-2.1v10.6a2.6 2.6 0 1 1-1.2-2.2V5.5L8 7z')],
};
const icon = (name, cls) => svg('0 0 20 20', ICONS[name] ?? ICONS.star, cls);
const SLOT_ICON = { pj: 'shirt', hat: 'hat', thread: 'thread', trail: 'trail', dance: 'dance' };
const FELTS = ['f-red', 'f-blue', 'f-amber', 'f-plum', 'f-green'];

/** The game's name, arched over a big MONKEYS. */
function logo() {
  const mk = (tag, attrs = {}, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  };
  const s = mk('svg', { viewBox: '0 0 600 236', class: 'logo', role: 'img', 'aria-label': 'Five Little Monkeys' });
  const defs = mk('defs');
  defs.appendChild(mk('path', { id: 'arc', d: 'M86 112 Q300 2 514 112' }));
  s.appendChild(defs);
  const t1 = mk('text', { class: 'l1' });
  t1.appendChild(mk('textPath', { href: '#arc', startOffset: '50%', 'text-anchor': 'middle' }, 'FIVE LITTLE'));
  s.appendChild(t1);
  s.appendChild(mk('text', { class: 'l2 sh', x: '300', y: '226', 'text-anchor': 'middle' }, 'MONKEYS'));
  s.appendChild(mk('text', { class: 'l2', x: '300', y: '214', 'text-anchor': 'middle' }, 'MONKEYS'));
  return s;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function createUI(root, cb) {
  root.replaceChildren();

  // ---- Title ----
  const title = el('div', 'hide', root);
  title.id = 'title';
  const logoBox = el('div', 'logobox', title);
  logoBox.appendChild(logo());
  const me = el('div', 'card felt f-navy mecard', title);
  const meDisc = el('div', 'disc big', me);
  const meImg = el('img', 'hide', meDisc);
  meImg.alt = '';
  const meLv = el('div', 'lv slab', meDisc);
  const meInfo = el('div', 'info', me);
  const meName = el('div', 'nm slab', meInfo, 'LEVEL 1');
  const meBar = el('div', 'xpbar', meInfo);
  const meFill = el('i', '', meBar);
  const meXp = el('div', 'xp', meInfo);
  const meRow = el('div', 'chips', meInfo);
  const meStreak = el('span', 'chip moonchip', meRow);
  const meStars = el('span', 'chip starchip', meRow);

  const goals = el('div', 'card felt f-plum goals', title);
  const gHead = el('div', 'head slab', goals);
  gHead.appendChild(icon('moon', 'ic'));
  el('span', '', gHead, 'TONIGHT');
  const gList = el('div', 'list', goals);
  const gBox = el('div', 'boxrow', goals);
  gBox.appendChild(icon('gift', 'ic'));
  const gBoxT = el('span', '', gBox, 'BEDTIME BOX');

  const btns = el('div', 'btns', title);
  const wardB = el('button', 'pill felt f-red side', btns);
  wardB.appendChild(icon('hanger', 'ic'));
  el('span', 'lb', wardB, 'WARDROBE');
  wardB.addEventListener('click', () => cb.onWardrobe());
  const play = el('button', 'pill felt f-amber play', btns);
  el('span', 'lb slab', play, 'PLAY');
  const playKey = el('small', 'key', play, 'SPACE');
  play.addEventListener('click', () => cb.onPlay());
  const rushB = el('button', 'pill felt f-blue side rush', btns);
  rushB.appendChild(icon('moon', 'ic'));
  const rushT = el('span', 'lb', rushB);
  el('b', '', rushT, "TONIGHT'S RUSH");
  const rushSub = el('small', '', rushT);
  const rushNew = el('i', 'new hide', rushB);
  rushB.addEventListener('click', () => cb.onRush());

  // ---- Wardrobe ----
  const ward = el('div', 'hide', root);
  ward.id = 'wardrobe';
  const wPanel = el('div', 'card felt f-navy', ward);
  const wHead = el('div', 'whead', wPanel);
  el('h2', 'slab', wHead, 'WARDROBE');
  const wDone = el('button', 'pill felt f-amber small', wHead, 'DONE');
  wDone.addEventListener('click', () => cb.onWardrobeClose());
  const wTabs = el('div', 'tabs', wPanel);
  const wGrid = el('div', 'grid', wPanel);
  const wFoot = el('div', 'wfoot', wPanel);

  // ---- Lobby band ----
  const band = el('div', 'hide', root);
  band.id = 'band';
  const bedsBox = el('div', 'group', band);
  const optBox = el('div', 'group', band);
  const roundsB = el('button', 'pill felt f-plum opt', optBox);
  roundsB.addEventListener('click', () => cb.onRounds());
  const bedBtns = new Map();

  const tags = el('div', '', root);
  tags.id = 'tags';
  const tagEls = new Map();
  const invite = el('button', 'pill felt f-green invite hide', root, 'INVITE');
  invite.addEventListener('click', () => cb.onInvite());

  // ---- HUD ----
  const strip = el('div', 'hide', root);
  strip.id = 'strip';
  const seatEls = new Map();

  const clock = el('div', 'hide', root);
  clock.id = 'clock';
  const face = el('div', 'face', clock);
  el('div', 'wedge', face);
  const hand = el('div', 'hand', face);
  el('div', 'pin', face);
  const dots = el('div', 'dots', clock);

  const rush = el('div', 'hide', root);
  rush.id = 'rushhud';
  const rBand = el('div', 'bandages', rush);
  const rScore = el('div', 'score slab', rush, '0');
  const rCombo = el('div', 'combo', rush);
  const rComboT = el('b', 'slab', rCombo, '×1');
  const rComboBar = el('i', '', el('span', 'bar', rCombo));

  const banner = el('div', 'hide', root);
  banner.id = 'banner';
  const bStrip = el('div', 'ribbon slab', banner);
  const bBy = el('div', 'by outline', banner);

  const hint = el('div', 'outline hide', root);
  hint.id = 'hint';
  const count = el('div', 'slab hide', root);
  count.id = 'count';
  const floaters = el('div', '', root);
  floaters.id = 'floaters';

  const results = el('div', 'hide', root);
  results.id = 'results';
  const rushOver = el('div', 'hide', root);
  rushOver.id = 'rushover';

  const pause = el('div', 'card felt f-plum center hide', root);
  el('h2', 'slab', pause, 'PAUSED');
  const resume = el('button', 'pill felt f-amber', pause, 'RESUME');
  resume.addEventListener('click', () => cb.onResume());

  const closed = el('div', 'card felt f-navy center hide', root);
  const closedH = el('h2', 'slab', closed);
  const closedB = el('button', 'pill felt f-amber', closed);
  closedB.addEventListener('click', () => cb.onRejoin());

  let bannerKey = '';
  let bannerUntil = 0;
  let countN = null;
  const timers = new Set();
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const setImg = (img, src) => {
    if (src && img.getAttribute('src') !== src) img.src = src;
    img.classList.toggle('hide', !src);
  };

  /**
   * The progress block for the results and the Rush: XP lines counting into the level bar, level-ups, the nightly goals
   * ticking, the streak, then what was unlocked and the Bedtime Box. `prog`: from bankProgress; `swatch(item)`: a picture.
   */
  function progressBlock(parent, prog, swatch, delay = 600) {
    const box = el('div', 'prog', parent);
    const lv = el('div', 'lvrow', box);
    const lvB = el('div', 'lvbadge slab', lv, String(prog.before.level));
    const barBox = el('div', 'lvbar', lv);
    const bar = el('div', 'xpbar', barBox);
    const fill = el('i', '', bar);
    const xpT = el('div', 'xp', barBox);
    const lines = el('div', 'lines', box);
    const after = el('div', 'after', box);
    let level = prog.before.level;
    let into = prog.before.into;
    let need = prog.before.need;
    const setBar = () => {
      fill.style.width = `${need ? Math.min(100, (into / need) * 100) : 100}%`;
      xpT.textContent = need ? `${fmt(into)} / ${fmt(need)} XP` : 'MAX LEVEL';
      lvB.textContent = String(level);
    };
    setBar();
    let at = delay;
    const step = prog.lines.length > 8 ? 170 : 240;
    prog.lines.forEach((ln, i) => {
      later(at, () => {
        const row = el('div', 'ln', lines);
        el('span', '', row, ln.what);
        el('b', '', row, `+${fmt(ln.xp)}`);
        sfx.tick(i);
        // Pour this line's XP into the bar, levelling up as it fills.
        let left = ln.xp;
        let up = false;
        while (left > 0 && need) {
          const take = Math.min(left, need - into);
          into += take;
          left -= take;
          if (into >= need) {
            level++;
            into = 0;
            need = level >= 50 ? 0 : 100 + 50 * level;
            up = true;
          }
        }
        if (up) {
          lvB.classList.remove('pop');
          void lvB.offsetWidth;
          lvB.classList.add('pop');
          box.classList.add('levelled');
          sfx.levelUp();
        }
        setBar();
      });
      at += step;
    });
    at += 200;
    later(at, () => {
      const g = el('div', 'goalsmini', after);
      prog.goals.forEach((go, i) => {
        const row = el('div', `gm${go.done && !go.just ? ' done' : ''}`, g);
        const ck = el('span', 'ck', row);
        if (go.done && !go.just) ck.appendChild(icon('check'));
        el('span', 't', row, go.text);
        const b = el('span', 'bar', row);
        const f = el('i', '', b);
        f.style.width = `${(go.was / go.n) * 100}%`;
        el('span', 'n', row, `${Math.min(go.now, go.n)}/${go.n}`);
        later(150 + i * 160, () => {
          f.style.width = `${(go.now / go.n) * 100}%`;
          if (go.just) {
            row.classList.add('done', 'just');
            ck.replaceChildren(icon('check'));
            sfx.goal();
          }
        });
      });
      if (prog.streak.n > 0) {
        const s = el('div', `streak${prog.streak.grew ? ' grew' : ''}`, after);
        s.appendChild(icon('moon', 'ic'));
        el('span', '', s, `${prog.streak.n} ${prog.streak.n === 1 ? 'NIGHT' : 'NIGHTS'} IN A ROW`);
      }
    });
    at += 800;
    const gifts = [...prog.unlocks.map((it) => ({ it, what: it.what ?? 'NEW' })), ...(prog.box ? [{ it: prog.box, what: 'BEDTIME BOX', box: true }] : [])];
    gifts.forEach((g, i) => {
      later(at + i * 450, () => {
        const card = el('div', `gift${g.box ? ' box' : ''}`, after);
        const sw = el('span', 'sw', card);
        const src = swatch?.(g.it);
        if (src && src.startsWith('#')) {
          sw.classList.add('dot');
          sw.style.setProperty('--c', src);
        } else if (src) {
          const im = el('img', '', sw);
          im.src = src;
          im.alt = '';
        } else sw.appendChild(icon(SLOT_ICON[g.it.slot] ?? 'star'));
        const tx = el('span', 'tx', card);
        el('small', '', tx, g.what);
        el('b', '', tx, g.it.name);
        if (g.box) sfx.box();
        else sfx.star(i % 3);
      });
    });
    return at + gifts.length * 450;
  }

  const ui = {
    /**
     * d: null, or { level, into, need, streak, stars, portrait, goals: [{ text, now, n, done }], boxState: 'locked' |
     * 'ready' | 'opened', rushSub, rushNew, touch }
     */
    title(d) {
      title.classList.toggle('hide', !d);
      if (!d) return;
      playKey.classList.toggle('hide', !!d.touch);
      setImg(meImg, d.portrait);
      const key = JSON.stringify({ ...d, portrait: !!d.portrait });
      if (title._key === key) return;
      title._key = key;
      meLv.textContent = String(d.level);
      meName.textContent = `LEVEL ${d.level}`;
      meFill.style.width = `${d.need ? (d.into / d.need) * 100 : 100}%`;
      meXp.textContent = d.need ? `${fmt(d.into)} / ${fmt(d.need)} XP` : 'MAX LEVEL';
      meStreak.replaceChildren(icon('moon', 'ic'), `${d.streak}`);
      meStreak.title = 'Nights in a row';
      meStreak.classList.toggle('dim', !d.streak);
      meStars.replaceChildren(icon('star', 'ic'), `${d.stars}/15`);
      meStars.title = 'Bedtime Ladder stars';
      gList.replaceChildren();
      for (const g of d.goals) {
        const row = el('div', `g${g.done ? ' done' : ''}`, gList);
        const ck = el('span', 'ck', row);
        if (g.done) ck.appendChild(icon('check'));
        const tx = el('span', 't', row);
        el('span', '', tx, g.text);
        const bar = el('span', 'bar', tx);
        el('i', '', bar).style.width = `${Math.min(100, (g.now / g.n) * 100)}%`;
        el('span', 'n', row, `${Math.min(g.now, g.n)}/${g.n}`);
      }
      gBox.className = `boxrow ${d.boxState}`;
      gBoxT.textContent = d.boxState === 'opened' ? 'BOX OPENED' : 'BEDTIME BOX';
      rushSub.textContent = d.rushSub;
      rushNew.classList.toggle('hide', !d.rushNew);
    },
    /** Where the title's pieces are, so the 3D frame keeps clear of them. */
    titleRects() {
      if (title.classList.contains('hide')) return null;
      return { logo: logoBox.getBoundingClientRect(), btns: btns.getBoundingClientRect(), me: me.getBoundingClientRect(), goals: goals.getBoundingClientRect() };
    },
    placeTitle(menuBottom) {
      title.style.setProperty('--menu-b', `${menuBottom}px`);
    },
    /** d: null, or { key, slot, slots: [{ id, name }], items: [{ id, name, owned, worn, lock, swatch, color }], note } */
    wardrobe(d) {
      ward.classList.toggle('hide', !d);
      if (!d) {
        ward._key = '';
        return;
      }
      ward.style.setProperty('--menu-b', `${d.menuBottom ?? 0}px`);
      if (ward._key === d.key) return;
      ward._key = d.key;
      wTabs.replaceChildren();
      for (const s of d.slots) {
        const b = el('button', `tab${s.id === d.slot ? ' on' : ''}`, wTabs);
        b.appendChild(icon(SLOT_ICON[s.id], 'ic'));
        el('span', '', b, s.name);
        b.addEventListener('click', () => cb.onWear(s.id, null));
      }
      wGrid.replaceChildren();
      for (const it of d.items) {
        const b = el('button', `item${it.worn ? ' worn' : ''}${it.owned ? '' : ' locked'}`, wGrid);
        const sw = el('span', 'sw', b);
        if (it.color) {
          sw.classList.add('dot');
          sw.style.setProperty('--c', it.color);
        } else if (it.swatch) {
          const im = el('img', '', sw);
          im.src = it.swatch;
          im.alt = '';
        } else sw.appendChild(icon(SLOT_ICON[d.slot], 'ic'));
        el('span', 'nm', b, it.name);
        if (!it.owned) {
          const lk = el('span', 'lk', b);
          lk.appendChild(icon(it.lockIcon ?? 'lock', 'ic'));
          lk.append(it.lock);
        }
        if (it.worn) el('span', 'wc', b).appendChild(icon('check'));
        b.setAttribute('aria-label', `${it.name}${it.owned ? '' : ` (${it.lock})`}`);
        b.addEventListener('click', () => cb.onWear(d.slot, it.id));
      }
      wFoot.textContent = d.note ?? '';
    },
    /** Pictures in the wardrobe as they finish drawing ([src | null] in item order). */
    wardrobeSwatches(list) {
      const items = wGrid.querySelectorAll('.item');
      list.forEach((src, i) => {
        const b = items[i];
        if (!b || !src) return;
        const sw = b.querySelector('.sw');
        if (sw.classList.contains('dot')) return;
        let im = sw.querySelector('img');
        if (!im) {
          sw.replaceChildren();
          im = el('img', '', sw);
          im.alt = '';
        }
        if (im.getAttribute('src') !== src) im.src = src;
      });
    },
    wardrobeRect() {
      return ward.classList.contains('hide') ? null : wPanel.getBoundingClientRect();
    },
    /** s: null, or { beds: [{ id, name, short, stars: [0|1,...], locked, on }], host, rounds } */
    band(s) {
      band.classList.toggle('hide', !s);
      if (!s) return;
      s.beds.forEach((b, i) => {
        let btn = bedBtns.get(b.id);
        if (!btn) {
          btn = el('button', `pill felt ${FELTS[i % FELTS.length]} bed`, bedsBox);
          btn.appendChild(svg('0 0 34 16', BED_SVG[b.id] ?? BED_SVG.kid));
          el('span', 'nm', btn);
          el('span', 'st', btn);
          btn.addEventListener('click', () => cb.onBed(b.id));
          bedBtns.set(b.id, btn);
        }
        btn.querySelector('.nm').textContent = b.short;
        const st = btn.querySelector('.st');
        st.replaceChildren();
        for (const v of b.stars) st.appendChild(icon('star', v ? 'on' : 'off'));
        btn.classList.toggle('on', !!b.on);
        btn.classList.toggle('locked', !!b.locked);
        btn.classList.toggle('dim', !s.host && !b.on);
        btn.disabled = !s.host || b.locked;
        btn.setAttribute('aria-label', `${b.name}${b.locked ? ' (locked)' : ''}`);
      });
      roundsB.replaceChildren();
      el('b', 'slab', roundsB, String(s.rounds));
      roundsB.append('ROUNDS');
      roundsB.disabled = !s.host;
      roundsB.classList.toggle('dim', !s.host);
    },
    /** list: [{ id, x, y, name, ready, host, next }] (screen px) */
    tags(list) {
      const seen = new Set();
      for (const t of list) {
        seen.add(t.id);
        let e = tagEls.get(t.id);
        if (!e) {
          e = el('div', 'tag outline', tags);
          e._nm = el('span', '', e);
          e._ck = el('span', 'ck', e);
          e._key = el('span', 'key', e);
          tagEls.set(t.id, e);
        }
        e.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -100%)`;
        e._nm.textContent = t.name;
        e._ck.classList.toggle('hide', t.ready === null);
        e._ck.classList.toggle('on', !!t.ready);
        if (e._ck._on !== !!t.ready) {
          e._ck._on = !!t.ready;
          e._ck.replaceChildren(...(t.ready ? [icon('check')] : []));
        }
        if (e._key._on !== !!t.host) {
          e._key._on = !!t.host;
          e._key.replaceChildren(...(t.host ? [icon('key')] : []));
        }
        e.classList.toggle('next', !!t.next);
      }
      for (const [id, e] of tagEls) if (!seen.has(id)) {
        e.remove();
        tagEls.delete(id);
      }
    },
    invite(pos) {
      invite.classList.toggle('hide', !pos);
      if (pos) {
        invite.style.left = `${pos.x}px`;
        invite.style.top = `${pos.y}px`;
      }
    },
    /** seats: null, or [{ id, name, hex, points, out, me, cap, portrait, stars, toy, tier }] */
    strip(seats) {
      strip.classList.toggle('hide', !seats);
      if (!seats) return;
      const seen = new Set();
      for (const s of seats) {
        seen.add(s.id);
        let e = seatEls.get(s.id);
        if (!e) {
          e = el('div', 'seat', strip);
          e._disc = el('div', 'disc', e);
          e._img = el('img', 'hide', e._disc);
          e._img.alt = '';
          e._x = el('div', 'x', e._disc);
          e._x.appendChild(icon('bandage'));
          e._stars = el('div', 'stars', e);
          for (let i = 0; i < 3; i++) e._stars.appendChild(icon('star'));
          e._toy = el('div', 'toy hide', e);
          e._cap = el('div', 'cap hide', e);
          e._cap.appendChild(icon('crown'));
          e._tag = el('div', 'ptag slab', e);
          e._nm = el('div', 'nm outline', e);
          seatEls.set(s.id, e);
        }
        e.style.setProperty('--c', s.hex);
        setImg(e._img, s.portrait);
        e._nm.textContent = s.me ? 'YOU' : s.name.slice(0, 9);
        if (e._tag.textContent !== String(s.points)) {
          const was = e._tag.textContent;
          e._tag.textContent = String(s.points);
          if (was) {
            e._tag.classList.remove('bump');
            void e._tag.offsetWidth;
            e._tag.classList.add('bump');
          }
        }
        [...e._stars.children].forEach((st, i) => st.classList.toggle('on', i < (s.stars ?? 0)));
        e._stars.classList.toggle('hide', !s.stars || s.out);
        if (e._toy._k !== s.toy) {
          e._toy._k = s.toy;
          e._toy.className = `toy ${s.toy || 'hide'}`;
          e._toy.replaceChildren(...(s.toy ? [icon(s.toy === 'mega' ? 'banana' : 'pillow')] : []));
        }
        e._cap.classList.toggle('hide', !s.cap);
        e.classList.toggle('out', !!s.out);
        e.classList.toggle('me', !!s.me);
        e.classList.toggle('danger', !s.out && (s.stars ?? 0) >= 3);
        e.dataset.tier = String(s.tier ?? 0);
      }
      for (const [id, e] of seatEls) if (!seen.has(id)) {
        e.remove();
        seatEls.delete(id);
      }
      seats.forEach((s, i) => {
        const e = seatEls.get(s.id);
        if (strip.children[i] !== e) strip.insertBefore(e, strip.children[i] ?? null);
      });
    },
    plushRect(id) {
      const e = seatEls.get(id);
      if (!e || strip.classList.contains('hide')) return null;
      const rr = e._tag.getBoundingClientRect();
      return { x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 };
    },
    stripRect() {
      return strip.classList.contains('hide') ? null : strip.getBoundingClientRect();
    },
    bandRect() {
      return band.classList.contains('hide') ? null : band.getBoundingClientRect();
    },
    clock(t, round, rounds, ringing) {
      clock.classList.toggle('hide', t === null);
      if (t === null) return;
      hand.style.transform = `rotate(${Math.min(1, t / 90) * 360}deg)`;
      clock.classList.toggle('ring', !!ringing);
      if (dots.children.length !== rounds) {
        dots.replaceChildren();
        for (let i = 0; i < rounds; i++) el('i', '', dots);
      }
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i < round));
    },
    placeClock(x, y) {
      clock.style.left = `${x}px`;
      clock.style.top = `${y}px`;
    },
    /** d: null, or { score, combo, comboLeft (0-1), bandages, max } */
    rushHud(d) {
      rush.classList.toggle('hide', !d);
      if (!d) return;
      const s = fmt(d.score);
      if (rScore.textContent !== s) {
        rScore.textContent = s;
        rScore.classList.remove('bump');
        void rScore.offsetWidth;
        rScore.classList.add('bump');
      }
      rComboT.textContent = `×${d.combo || 1}`;
      rCombo.classList.toggle('live', d.combo > 1);
      rComboBar.style.width = `${Math.max(0, Math.min(1, d.comboLeft)) * 100}%`;
      if (rBand.children.length !== d.max) {
        rBand.replaceChildren();
        for (let i = 0; i < d.max; i++) rBand.appendChild(icon('bandage', 'bd'));
      }
      [...rBand.children].forEach((b, i) => b.classList.toggle('gone', i >= d.bandages));
    },
    placeRush(top) {
      rush.style.top = `${top}px`;
    },
    rushRect() {
      return rush.classList.contains('hide') ? null : rush.getBoundingClientRect();
    },
    /** A verse on a ribbon for `secs`; `by`: [{ text, color }] pieces, or null; kind: '' | 'twist' | 'wild' | 'gold'. */
    banner(text, by, secs, kind = '') {
      const key = `${text}|${by ? by.map((p) => p.text).join('') : ''}`;
      if (key !== bannerKey) {
        bannerKey = key;
        bStrip.textContent = text;
        bStrip.className = `ribbon slab ${kind}`;
        void bStrip.offsetWidth;
        bStrip.classList.add('unroll');
        bBy.replaceChildren();
        for (const p of by ?? []) {
          const s = el('span', '', bBy, p.text);
          if (p.color) s.style.color = p.color;
        }
      }
      bannerUntil = performance.now() / 1000 + secs;
      banner.classList.remove('hide');
    },
    tickBanner() {
      if (performance.now() / 1000 > bannerUntil && !banner.classList.contains('hide')) {
        banner.classList.add('hide');
        bannerKey = '';
      }
    },
    clearBanner() {
      banner.classList.add('hide');
      bannerKey = '';
      bannerUntil = 0;
    },
    placeBanner(top) {
      banner.style.top = `${top}px`;
    },
    hint(text, x, y) {
      hint.classList.toggle('hide', !text);
      if (!text) return;
      if (hint.textContent !== text) hint.textContent = text;
      hint.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    },
    count(n) {
      if (n === countN) return;
      countN = n;
      count.classList.toggle('hide', n === null);
      if (n === null) return;
      count.textContent = n === 0 ? 'JUMP!' : String(n);
      count.classList.remove('pop');
      void count.offsetWidth;
      count.classList.add('pop');
    },
    floater(text, from, to, color) {
      const f = el('div', 'floater slab', floaters, text);
      f.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
      if (color) f.style.color = color;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(0.7)`;
      }));
      setTimeout(() => {
        f.style.opacity = '0';
      }, 900);
      setTimeout(() => f.remove(), 1300);
    },
    /** A word that pops over the world and floats up (a toy's name, Rush points). */
    pop(text, x, y, color, sub) {
      const p = el('div', 'popword slab', floaters);
      el('span', '', p, text);
      if (sub) el('small', '', p, sub);
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      if (color) p.style.color = color;
      setTimeout(() => p.remove(), 1100);
    },
    /**
     * rs: null, or { key, title, rows: [{ place, name, hex, points, me, portrait }], prog, ladder: { bed, stars, fresh },
     * again: label | null, wait, swatch(item) }
     */
    results(rs) {
      results.classList.toggle('hide', !rs);
      if (!rs) {
        results._key = '';
        return;
      }
      if (results._key === rs.key) {
        if (results._wait) results._wait.textContent = rs.wait ?? '';
        if (results._again) results._again.classList.toggle('hide', !rs.again);
        rs.rows.forEach((row, i) => results._imgs?.[i] && setImg(results._imgs[i], row.portrait));
        return;
      }
      results._key = rs.key;
      results.replaceChildren();
      const card = el('div', 'card felt f-navy', results);
      el('h2', 'slab', card, rs.title);
      const cols = el('div', `cols${rs.prog ? '' : ' one'}`, card);
      const left = el('div', 'standings', cols);
      results._imgs = [];
      for (const row of rs.rows) {
        const rw = el('div', `rw${row.me ? ' me' : ''}`, left);
        el('span', 'pl slab', rw, String(row.place));
        const d = el('span', 'disc', rw);
        d.style.setProperty('--c', row.hex);
        const im = el('img', 'hide', d);
        im.alt = '';
        setImg(im, row.portrait);
        results._imgs.push(im);
        el('span', 'nm', rw, row.name);
        el('span', 'pts slab', rw, String(row.points));
      }
      if (rs.ladder) {
        const ld = el('div', 'ladder', left);
        el('span', '', ld, rs.ladder.bed);
        rs.ladder.stars.forEach((v, i) => {
          const s = icon('star', v ? 'on' : 'off');
          if (rs.ladder.fresh.includes(i)) s.classList.add('fresh');
          ld.appendChild(s);
        });
      }
      if (rs.prog) progressBlock(el('div', 'progcol', cols), rs.prog, rs.swatch, 700);
      const foot = el('div', 'foot', card);
      results._again = el('button', 'pill felt f-amber again', foot, rs.again ?? 'PLAY AGAIN');
      results._again.classList.toggle('hide', !rs.again);
      results._again.addEventListener('click', () => cb.onAgain());
      results._wait = el('div', 'wait', foot, rs.wait ?? '');
    },
    /** d: null, or { key, score, best, tonight, newBest, board: [{ rank, name, score, me }] | null, prog, swatch, info } */
    rushOver(d) {
      rushOver.classList.toggle('hide', !d);
      if (!d) {
        rushOver._key = '';
        return;
      }
      if (rushOver._key === d.key) {
        if (rushOver._board && d.board && !rushOver._boardDone) {
          rushOver._boardDone = true;
          rushOver._board.replaceChildren();
          if (!d.board.length) el('div', 'wait', rushOver._board, 'No scores yet');
          for (const e of d.board) {
            const row = el('div', `br${e.me ? ' me' : ''}`, rushOver._board);
            el('span', 'rk slab', row, String(e.rank));
            el('span', 'nm', row, e.name);
            el('span', 'sc slab', row, fmt(e.score));
          }
        }
        return;
      }
      rushOver._key = d.key;
      rushOver._boardDone = false;
      rushOver.replaceChildren();
      const card = el('div', 'card felt f-navy', rushOver);
      const head = el('div', 'rhead', card);
      head.appendChild(icon('moon', 'ic'));
      el('span', '', head, `TONIGHT'S RUSH · ${d.info}`);
      const big = el('div', 'bigscore slab', card, '0');
      let shown = 0;
      const tick = () => {
        shown = Math.min(d.score, shown + Math.max(7, Math.ceil(d.score / 40)));
        big.textContent = fmt(shown);
        if (shown < d.score) later(28, tick);
        else if (d.newBest) {
          big.classList.add('best');
          el('div', 'newbest ribbon slab gold unroll', card, 'NEW BEST!');
          sfx.win();
        }
      };
      later(350, tick);
      const sub = el('div', 'bests', card);
      el('span', '', sub, `TONIGHT ${fmt(d.tonight)}`);
      el('span', '', sub, `BEST ${fmt(d.best)}`);
      const cols = el('div', 'cols', card);
      const boardCol = el('div', 'boardcol', cols);
      el('div', 'bh', boardCol, 'TONIGHT');
      rushOver._board = el('div', 'board', boardCol);
      el('div', 'wait', rushOver._board, d.board === undefined ? '' : '…');
      if (d.prog) progressBlock(el('div', 'progcol', cols), d.prog, d.swatch, 900);
      const foot = el('div', 'foot', card);
      const again = el('button', 'pill felt f-amber again', foot, 'AGAIN');
      again.addEventListener('click', () => cb.onRushAgain());
      const quit = el('button', 'pill felt f-plum small', foot, 'DONE');
      quit.addEventListener('click', () => cb.onRushQuit());
    },
    pause(on) {
      pause.classList.toggle('hide', !on);
    },
    closed(msg, button) {
      closed.classList.toggle('hide', !msg);
      if (!msg) return;
      closedH.textContent = msg;
      closedB.textContent = button;
    },
    /** Lay out around the platform's reserved areas. */
    layout(top) {
      strip.style.top = `${top}px`;
      band.style.top = `${Math.max(12, top)}px`;
    },
    clearTimers() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
  return ui;
}
