// Member check-in streak for display. QR check-ins (processScan) and
// fingerprint check-ins (bio-gateway) store it on the member doc as
// current_streak + last_checkin_date ('YYYY-MM-DD', IST). The stored number only
// changes on the next check-in, so a streak whose last check-in was before
// yesterday has already lapsed and is shown as 0.

const IST_OFFSET_MS = 330 * 60 * 1000;
const istDay = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

export function displayStreak(member, now = Date.now()) {
  const current = member?.current_streak ?? member?.streak ?? 0;
  const last = member?.last_checkin_date;
  if (!current || !last) return current || 0;
  const today = istDay(now);
  const yesterday = istDay(now - 86400000);
  return last === today || last === yesterday ? current : 0;
}
