// backend/utils/dates.js
// Date helpers. A "YYYY-MM-DD" string is a calendar day, so it is read as local midnight.
// new Date('YYYY-MM-DD') reads it as UTC midnight, which is the previous evening in US time zones.

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Returns a local-midnight Date for a "YYYY-MM-DD" string, or null if the string is not a real date.
const parseLocalDate = (value) => {
  if (typeof value !== 'string') return null;
  const match = ISO_DAY.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  // Rejects overflow such as 2026-02-31, which Date would roll into March.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
};

// Local midnight of the given moment (default now).
const startOfDay = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

// Accepts "YYYY-MM-DD" or a Date (as returned by pg for DATE columns). Returns local midnight or null.
const toLocalDay = (value) => {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : startOfDay(value);
  if (typeof value === 'string') {
    const exact = parseLocalDate(value);
    if (exact) return exact;
    const loose = new Date(value);
    return isNaN(loose.getTime()) ? null : startOfDay(loose);
  }
  return null;
};

module.exports = { parseLocalDate, startOfDay, toLocalDay };
