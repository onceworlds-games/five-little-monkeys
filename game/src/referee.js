// What only the host decides: who fell and who gets the credit, who is away, when a round ends and its points.
// Pure (no SDK): net.js runs it on the host's page, the tests run it on a fake room.
import { ROUND } from './sim/config.js';
import { addFall, aliveIds, roundOver, outcomeOf } from './sim/round.js';

/** Credit goes only to a seat that slammed or threw a pillow within this many seconds before the fall. */
export const CREDIT_WINDOW = 4;

export function createReferee() {
  const awaySince = new Map();
  const lastAct = new Map();

  const ids = (m) => m.seats.map((s) => s.id);

  return {
    /** A seat slammed or threw (a checked message, or the host's own page and bots). */
    acted(id, at) {
      lastAct.set(id, at);
    },
    /** A paused match resumes: away clocks start again. */
    resume() {
      awaySince.clear();
    },
    /**
     * Record a fall in the round's data. m: { phase, seats, data, setData(fn) }; now: the round's sim time.
     * Returns whether it was recorded (not a seat, already out, or outside a round: no).
     */
    fall(m, now, { id, by = '', at = 0, kind = '', how = 'fell' }) {
      if (m.phase !== 'round') return false;
      const seatIds = ids(m);
      const falls = m.data?.falls ?? [];
      if (!seatIds.includes(id) || falls.some((f) => f.id === id)) return false;
      const when = Math.max(0, Math.min(Number(at) || 0, now + 1));
      let credit = by && by !== id && seatIds.includes(by) ? by : '';
      const acted = lastAct.get(credit);
      if (credit && (acted === undefined || when - acted > CREDIT_WINDOW || acted - when > 1)) credit = '';
      m.setData((d) => {
        addFall(d.falls, seatIds, { id, by: credit, at: when, how, kind: credit ? kind : '' });
      });
      return true;
    },
    /**
     * The host's tick: away seats counted out after ROUND.awayOut seconds (ms: the match clock in ms), then the end of the
     * round when it's over. Returns the outcome it ended the round with, or null.
     */
    tick(m, now, ms) {
      if (m.phase !== 'round') return null;
      const seatIds = ids(m);
      const alive = new Set(aliveIds(seatIds, m.data?.falls ?? []));
      for (const s of m.seats) {
        if (s.bot || !alive.has(s.id)) {
          awaySince.delete(s.id);
          continue;
        }
        if (s.away || s.left) {
          if (!awaySince.has(s.id)) awaySince.set(s.id, ms);
          else if (ms - awaySince.get(s.id) > ROUND.awayOut * 1000) {
            awaySince.delete(s.id);
            this.fall(m, now, { id: s.id, at: now, how: 'away' });
          }
        } else awaySince.delete(s.id);
      }
      const after = m.data?.falls ?? [];
      if (!roundOver(seatIds, after, now)) return null;
      const out = outcomeOf(seatIds, after, now);
      m.setData((d) => {
        d.winner = out.winner ?? '';
        d.endT = Math.round(Math.min(now, ROUND.endAt) * 100) / 100;
      });
      m.endRound(out.points);
      return out;
    },
  };
}
