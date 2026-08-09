// Best-time-to-post suggestions per provider, distilled from published
// engagement research (Sprout Social / Buffer / Hootsuite studies). Times are
// interpreted in the user's local timezone.

interface Slot {
  days: number[]; // 0 = Sunday … 6 = Saturday
  hours: number[]; // local hours
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const MIDWEEK = [2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKEND = [0, 6];

const SLOTS: Record<string, Slot[]> = {
  default: [{ days: WEEKDAYS, hours: [9, 10, 11] }],
  demo: [{ days: WEEKDAYS, hours: [9, 10, 11] }],
  x: [{ days: WEEKDAYS, hours: [9, 12, 17] }],
  linkedin: [{ days: MIDWEEK, hours: [9, 10, 12] }],
  bluesky: [{ days: WEEKDAYS, hours: [9, 11, 13] }],
  mastodon: [{ days: WEEKDAYS, hours: [8, 12, 18] }],
  reddit: [
    { days: [1, 2, 3], hours: [6, 7, 8] },
    { days: WEEKEND, hours: [9, 10] },
  ],
  pinterest: [
    { days: WEEKEND, hours: [20, 21] },
    { days: WEEKDAYS, hours: [14, 15] },
  ],
  instagram: [{ days: WEEKDAYS, hours: [11, 13, 19] }],
  telegram: [{ days: ALL, hours: [9, 12, 20] }],
  discord: [{ days: ALL, hours: [12, 18, 21] }],
  slack: [{ days: WEEKDAYS, hours: [9, 10, 14] }],
  devto: [{ days: WEEKDAYS, hours: [9, 12, 16] }],
  hashnode: [{ days: WEEKDAYS, hours: [9, 12, 16] }],
  medium: [{ days: MIDWEEK, hours: [8, 9, 12] }],
  wordpress: [{ days: MIDWEEK, hours: [9, 10, 11] }],
  webhook: [{ days: WEEKDAYS, hours: [9, 10, 11] }],
};

function tzParts(ts: number, tz: string): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), mo: get('month') - 1, d: get('day') };
}

// Convert a wall-clock time in `tz` to a UTC instant (no date-fns needed).
function wallToUtc(y: number, mo: number, d: number, h: number, tz: string): Date {
  const guess = Date.UTC(y, mo, d, h, 0, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const wallAsUtc = (ts: number): number => {
    const parts = dtf.formatToParts(new Date(ts));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const hour = get('hour') % 24;
    return Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  };
  let ts = guess - (wallAsUtc(guess) - guess);
  ts = guess - (wallAsUtc(ts) - guess); // refine once for DST edges
  return new Date(ts);
}

// Next `count` suggested publish slots (ISO strings) for the given providers,
// in the user's timezone. Empty providerIds → cross-network defaults.
export function bestSlots(providerIds: string[], tz: string, count = 3): string[] {
  const zone = tz || 'UTC';
  const slots: Slot[] = [];
  const ids = providerIds.length ? providerIds : ['default'];
  for (const id of ids) {
    slots.push(...(SLOTS[id] ?? SLOTS.default));
  }

  const now = Date.now();
  const { y, mo, d } = tzParts(now, zone);
  const candidates: number[] = [];
  for (let offset = 0; offset < 9; offset++) {
    const dayDate = new Date(Date.UTC(y, mo, d + offset));
    const weekday = dayDate.getUTCDay();
    for (const slot of slots) {
      if (!slot.days.includes(weekday)) continue;
      for (const hour of slot.hours) {
        const ts = wallToUtc(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate(), hour, zone).getTime();
        if (ts > now + 5 * 60_000) candidates.push(ts);
      }
    }
  }
  candidates.sort((a, b) => a - b);
  const unique = [...new Set(candidates)];
  return unique.slice(0, count).map((ts) => new Date(ts).toISOString());
}
