// The screens, in the bedroom's own language: stitched quilt patches, embroidered words, plush heads, a felt alarm clock.
// Plain DOM. Every name shown comes from players: it is set as text, never as HTML.

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
const BED_SVG = {
  kid: [r(2, 8, 30, 7, 2), r(2, 3, 5, 12, 1.5)],
  bunk: [r(2, 10, 30, 5, 2), r(2, 2, 18, 5, 2), r(2, 2, 3, 13)],
  water: [['path', { d: 'M2 9 q4 -3 8 0 t8 0 t8 0 t6 0 v6 h-30z' }], r(2, 4, 4, 11, 1.5)],
  king: [r(1, 8, 32, 7, 2), r(1, 2, 6, 13, 2), r(9, 5, 7, 3, 1.5)],
  poster: [r(4, 9, 26, 6, 2), r(3, 1, 2.5, 14), r(28.5, 1, 2.5, 14), r(3, 1, 28, 2)],
};
const STAR = ['path', { d: 'M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.9l6-.7z' }];
const SHAPES = {
  square: [r(3.5, 3.5, 13, 13, 1.5)],
  circle: [['circle', { cx: 10, cy: 10, r: 7 }]],
  triangle: [['path', { d: 'M10 2.5 L18 17 H2 Z' }]],
  star: [STAR],
  diamond: [['path', { d: 'M10 1.5 L18.5 10 L10 18.5 L1.5 10 Z' }]],
};
export const shapeIcon = (name, cls) => svg('0 0 20 20', SHAPES[name] ?? SHAPES.diamond, cls);
const starIcon = (cls) => svg('0 0 20 20', [STAR], cls);
const checkIcon = () => svg('0 0 20 20', [['path', { d: 'M3.5 10.5l4.2 4.2L16.5 5.8', fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]]);
const keyIcon = () => svg('0 0 20 20', [['circle', { cx: 6.5, cy: 10, r: 4.2 }], r(9, 8.6, 9, 2.8, 1), r(14, 8.6, 2.6, 6, 1)]);
const FABRICS = ['gingham', 'stripe', 'dots', 'cord', 'plaid'];
const BED_COL = ['c-red', 'c-blue', 'c-amber', 'c-plum', 'c-green'];

export function createUI(root, cb) {
  root.replaceChildren();
  // Title.
  const title = el('div', 'hide', root);
  title.id = 'title';
  const name = el('div', 'name patch c-red gingham embroid', title);
  el('span', 'l1', name, 'FIVE LITTLE');
  el('span', 'l2', name, 'MONKEYS');
  const row = el('div', 'row', title);
  const play = el('button', 'play patch c-amber plaid', row);
  play.append('PLAY ');
  const playKey = el('small', '', play, 'SPACE');
  play.addEventListener('click', () => cb.onPlay());
  const starsP = el('div', 'stars patch c-navy dots', row);

  // Lobby band.
  const band = el('div', 'hide', root);
  band.id = 'band';
  const bedsBox = el('div', 'group', band);
  const optBox = el('div', 'group', band);
  const roundsB = el('button', 'opt patch c-navy stripe', optBox);
  roundsB.addEventListener('click', () => cb.onRounds());
  const pjB = el('button', 'opt patch c-plum dots', optBox);
  pjB.addEventListener('click', () => cb.onPattern());
  const bedBtns = new Map();

  const tags = el('div', '', root);
  tags.id = 'tags';
  const tagEls = new Map();
  const invite = el('button', 'invite patch c-green gingham hide', root, 'Invite');
  invite.addEventListener('click', () => cb.onInvite());

  const strip = el('div', 'patch c-navy cord hide', root);
  strip.id = 'strip';
  const plushEls = new Map();

  const clock = el('div', 'hide', root);
  clock.id = 'clock';
  const face = el('div', 'face', clock);
  const hand = el('div', 'hand', face);
  const dots = el('div', 'dots', clock);

  const banner = el('div', 'hide', root);
  banner.id = 'banner';
  const bStrip = el('div', 'strip patch c-red stripe embroid', banner);
  const bBy = el('div', 'by outline', banner);

  const hint = el('div', 'outline hide', root);
  hint.id = 'hint';
  const count = el('div', 'embroid hide', root);
  count.id = 'count';
  const floaters = el('div', '', root);
  floaters.id = 'floaters';

  const results = el('div', 'patch c-navy gingham hide', root);
  results.id = 'results';

  const pause = el('div', 'card patch c-plum dots hide', root);
  el('h2', 'embroid', pause, 'Paused');
  const resume = el('button', 'patch c-amber plaid', pause, 'Resume');
  resume.addEventListener('click', () => cb.onResume());

  const closed = el('div', 'card patch c-navy stripe hide', root);
  const closedH = el('h2', 'embroid', closed);
  const closedB = el('button', 'patch c-amber plaid', closed);
  closedB.addEventListener('click', () => cb.onRejoin());

  let bannerKey = '';
  let bannerUntil = 0;
  let countN = null;

  const ui = {
    title(on, stars, best, touch) {
      title.classList.toggle('hide', !on);
      if (!on) return;
      playKey.classList.toggle('hide', !!touch);
      const key = `${stars}|${best}`;
      if (starsP._key === key) return;
      starsP._key = key;
      starsP.replaceChildren();
      const b = el('b', '', starsP);
      b.appendChild(starIcon('ic'));
      b.append(` ${stars}/15`);
      b.title = 'Stars';
      if (best) el('span', '', starsP, best);
    },
    /** s: null, or { beds: [{ id, name, short, stars: [0|1,...], locked, on }], host, rounds, pattern: { name, css } } */
    band(s) {
      band.classList.toggle('hide', !s);
      if (!s) return;
      s.beds.forEach((b, i) => {
        let btn = bedBtns.get(b.id);
        if (!btn) {
          btn = el('button', `bed patch ${BED_COL[i % BED_COL.length]} ${FABRICS[i % FABRICS.length]}`, bedsBox);
          btn.appendChild(svg('0 0 34 16', BED_SVG[b.id] ?? BED_SVG.kid));
          el('span', 'nm', btn);
          el('span', 'st', btn);
          btn.addEventListener('click', () => cb.onBed(b.id));
          bedBtns.set(b.id, btn);
        }
        btn.querySelector('.nm').textContent = b.short;
        const st = btn.querySelector('.st');
        st.replaceChildren();
        for (const v of b.stars) st.appendChild(starIcon(v ? 'on' : 'off'));
        btn.classList.toggle('on', !!b.on);
        btn.classList.toggle('locked', !!b.locked);
        btn.classList.toggle('dim', !s.host && !b.on);
        btn.disabled = !s.host || b.locked;
        btn.setAttribute('aria-label', `${b.name}${b.locked ? ' (locked)' : ''}`);
      });
      roundsB.replaceChildren();
      el('b', '', roundsB, String(s.rounds));
      roundsB.append('ROUNDS');
      roundsB.disabled = !s.host;
      roundsB.classList.toggle('dim', !s.host);
      pjB.replaceChildren();
      const sw = el('span', 'sw', pjB);
      sw.style.background = s.pattern.css;
      pjB.append(s.pattern.name.toUpperCase());
    },
    /** list: [{ id, x, y, name, ready, host, me, next }] (screen px) */
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
        e.style.left = `${t.x}px`;
        e.style.top = `${t.y}px`;
        e._nm.textContent = t.name;
        e._ck.classList.toggle('hide', t.ready === null);
        e._ck.classList.toggle('on', !!t.ready);
        if (e._ck._on !== !!t.ready) {
          e._ck._on = !!t.ready;
          e._ck.replaceChildren(...(t.ready ? [checkIcon()] : []));
        }
        if (e._key._on !== !!t.host) {
          e._key._on = !!t.host;
          e._key.replaceChildren(...(t.host ? [keyIcon()] : []));
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
    /** seats: null, or [{ id, name, hex, symbol, points, out, me, cap }] */
    strip(seats) {
      strip.classList.toggle('hide', !seats);
      if (!seats) return;
      const seen = new Set();
      for (const s of seats) {
        seen.add(s.id);
        let e = plushEls.get(s.id);
        if (!e) {
          e = el('div', 'plush', strip);
          e._hd = el('div', 'hd', e);
          e._sym = el('div', 'sym', e._hd);
          e._cap = el('div', 'cap', e._hd);
          e._nm = el('div', 'nm outline', e);
          e._pt = el('div', 'pt', e);
          plushEls.set(s.id, e);
        }
        e._hd.style.borderColor = s.hex;
        e._sym.style.background = s.hex;
        if (e._sym._shape !== s.symbol) {
          e._sym._shape = s.symbol;
          e._sym.replaceChildren(shapeIcon(s.symbol));
        }
        e._nm.textContent = s.name.slice(0, 8);
        e._pt.textContent = String(s.points);
        e._cap.classList.toggle('hide', !s.cap);
        e.classList.toggle('out', !!s.out);
        e.classList.toggle('me', !!s.me);
      }
      for (const [id, e] of plushEls) if (!seen.has(id)) {
        e.remove();
        plushEls.delete(id);
      }
      // Keep the strip's order.
      seats.forEach((s, i) => {
        const e = plushEls.get(s.id);
        if (strip.children[i] !== e) strip.insertBefore(e, strip.children[i] ?? null);
      });
    },
    plushRect(id) {
      const e = plushEls.get(id);
      if (!e || strip.classList.contains('hide')) return null;
      const r = e._pt.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
    /** A verse on the banner for `secs`; `by`: [{ text, color }] pieces, or null. */
    banner(text, by, secs) {
      const key = `${text}|${by ? by.map((p) => p.text).join('') : ''}`;
      if (key !== bannerKey) {
        bannerKey = key;
        bStrip.textContent = text;
        bStrip.classList.remove('unroll');
        void bStrip.offsetWidth;
        bStrip.classList.add('unroll');
        bBy.replaceChildren();
        for (const p of by ?? []) {
          const s = el('span', '', bBy, p.text);
          if (p.color) s.style.color = p.color;
        }
      }
      // One clock for showing and hiding (callers' frame times can differ from performance.now()).
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
      hint.style.left = `${x}px`;
      hint.style.top = `${y}px`;
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
      const f = el('div', 'floater embroid', floaters, text);
      f.style.left = `${from.x}px`;
      f.style.top = `${from.y}px`;
      if (color) f.style.color = color;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.left = `${to.x}px`;
        f.style.top = `${to.y}px`;
      }));
      setTimeout(() => {
        f.style.opacity = '0';
      }, 900);
      setTimeout(() => f.remove(), 1300);
    },
    /** r: null, or { title, rows: [{ place, name, hex, points, me }], news: [text | { star: text }], again: 'Play again' | null, wait } */
    results(r) {
      results.classList.toggle('hide', !r);
      if (!r) return;
      if (results._key === r.key) {
        if (results._wait) results._wait.textContent = r.wait ?? '';
        return;
      }
      results._key = r.key;
      results.replaceChildren();
      el('h2', 'embroid', results, r.title);
      for (const row of r.rows) {
        const rw = el('div', `rw${row.me ? ' me' : ''}`, results);
        el('span', 'pl embroid', rw, String(row.place));
        const hd = el('span', 'hd', rw);
        hd.style.borderColor = row.hex;
        hd.style.background = 'radial-gradient(circle at 50% 62%, #e8c39e 0 38%, transparent 39%), #6a4530';
        el('span', 'nm', rw, row.name);
        el('span', 'pts', rw, String(row.points));
      }
      const news = el('div', 'news', results);
      for (const n of r.news ?? []) {
        const line = el('div', '', news);
        const star = typeof n === 'object';
        const b = el('b', '', line);
        if (star) b.appendChild(starIcon('ic'));
        b.append(star ? ` ${n.star}` : String(n));
      }
      if (r.again) {
        const btns = el('div', 'btns', results);
        const again = el('button', 'again patch c-amber plaid', btns, r.again);
        again.addEventListener('click', () => cb.onAgain());
      }
      results._wait = el('div', 'wait', results, r.wait ?? '');
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
    layout(top, right) {
      strip.style.top = `${top}px`;
      clock.style.top = `${top + 2}px`;
      band.style.top = `${Math.max(12, top)}px`;
      if (right !== undefined) clock.style.right = `${right}px`;
    },
  };
  return ui;
}
