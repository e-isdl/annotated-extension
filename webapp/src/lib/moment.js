function toSeconds(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

export function hasMoment(start, end) {
  const startSec = toSeconds(start);
  const endSec = toSeconds(end);
  if (startSec === null || endSec === null) return false;
  return startSec >= 0 && endSec > startSec;
}
