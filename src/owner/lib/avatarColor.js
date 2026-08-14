// Solid avatar palette matching the Gymloop prototype (handoff/src/Gymloop-Owner-Prototype.dc.html).
// Distinct from src/utils/helpers.js's pastel getAvatarColor, which the old glass UI uses.
const AVATAR = ['#6C63C7', '#3E7CB1', '#2E8B6E', '#B5643C', '#8A5AA8', '#3F7A8C', '#A8523C', '#4E6BB5'];

export function getAvatarColor(name) {
  if (!name) return AVATAR[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR[Math.abs(hash) % AVATAR.length];
}
