// src/superadmin/lib/format.js
// Indian-locale formatting for the Super Admin console.
// Every number, amount and date rendered in the console goes through here so
// grouping (₹1,25,000 — not ₹125,000) and the DD MMM YYYY date shape stay
// consistent across screens. See handoff README §8.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Firestore Timestamp | Date | millis | ISO string → Date | null */
export const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v?.toDate === 'function') {
    try { return v.toDate(); } catch { return null; }
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatNum = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('en-IN') : '—');

export const formatINR = (n) => (Number.isFinite(Number(n)) ? `₹${Math.round(Number(n)).toLocaleString('en-IN')}` : '—');

/** Compact ₹ for KPI values where a full figure would wrap on mobile. */
export const formatINRCompact = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(v % 1e7 === 0 ? 0 : 1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(v % 1e5 === 0 ? 0 : 1)}L`;
  return formatINR(v);
};

/** 24 Sep 2026 */
export const formatDate = (v) => {
  const d = toDate(v);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};

/** 6:30 PM (IST) */
export const formatTime = (v) => {
  const d = toDate(v);
  if (!d) return '—';
  return d
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
    .replace(/\s*am$/i, ' AM')
    .replace(/\s*pm$/i, ' PM')
    .toUpperCase()
    .replace('AM', 'AM')
    .replace('PM', 'PM');
};

/** 22 Sep 2026, 6:30 PM */
export const formatDateTime = (v) => {
  const d = toDate(v);
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
};

/** 9876543210 → +91 98765 43210. Accepts +91-prefixed / spaced input. */
export const formatPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return raw || '—';
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
};

/** Last 10 digits, for prefilling a PhoneInput from stored data. */
export const toTenDigits = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Indian grouping applied to a digits-only string, live as the user types. */
export const groupDigits = (digits) => {
  const clean = String(digits || '').replace(/\D/g, '');
  return clean ? Number(clean).toLocaleString('en-IN') : '';
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from a → b. Positive when b is later. */
export const daysBetween = (a, b) => {
  const da = toDate(a);
  const dbb = toDate(b);
  if (!da || !dbb) return null;
  return Math.round((startOfDay(dbb) - startOfDay(da)) / 864e5);
};

/** "1 gym" / "2 gyms" — every count in the console is pluralised. */
export const plural = (n, one, many) => `${formatNum(n)} ${Number(n) === 1 ? one : many || `${one}s`}`;

export const startOfThisMonth = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
};

export const getInitials = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((w) => w[0])
  .join('')
  .toUpperCase() || '—';
