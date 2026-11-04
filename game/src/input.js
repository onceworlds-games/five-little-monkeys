// Steering and the one button, from the keyboard or the platform's touch controls. Remembers which was used last, so hints
// name the right control.

const KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(ow) {
  const held = new Set();
  let slamQueued = false;
  let lastPresses = 0;
  // null until the first input: then the device decides (a touch screen without a mouse shows touch hints).
  let last = null;
  const coarse = typeof matchMedia === 'function' ? matchMedia('(hover: none) and (pointer: coarse)') : null;
  const listeners = new Set();

  const setLast = (kind) => {
    if (kind === last) return;
    last = kind;
    for (const fn of listeners) fn(kind);
  };

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    // The platform's on-screen button presses a real key too: don't count it as the keyboard.
    if (e.isTrusted) setLast('keys');
    if (KEYS[e.code]) {
      held.add(e.code);
      e.preventDefault();
    }
    // The platform's button also presses Space (an untrusted event): it's counted through presses('slam') instead.
    if ((e.code === 'Space' || e.key === ' ') && !e.repeat && e.isTrusted) {
      slamQueued = true;
      if (e.code === 'Space') e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setLast('touch');
  }, { passive: true });

  return {
    /** Steering (-1..1 on x and z), summed from keys and the stick. */
    steer() {
      let x = 0;
      let z = 0;
      for (const c of held) {
        x += KEYS[c][0];
        z += KEYS[c][1];
      }
      const st = ow?.controls?.stick;
      if (st && (st.x || st.y)) {
        x += st.x;
        z += st.y;
        setLast('touch');
      }
      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
      return { x, z };
    },
    /** Was the button pressed since the last call? */
    takeSlam() {
      let p = slamQueued;
      slamQueued = false;
      const n = ow?.controls?.presses?.('slam') ?? 0;
      if (n > lastPresses) {
        p = true;
        setLast('touch');
      }
      lastPresses = n;
      return p;
    },
    clear() {
      slamQueued = false;
      lastPresses = ow?.controls?.presses?.('slam') ?? 0;
    },
    get touch() {
      if (last) return last === 'touch';
      return !!(ow?.controls?.touch || coarse?.matches);
    },
    onChange(fn) {
      listeners.add(fn);
    },
  };
}
