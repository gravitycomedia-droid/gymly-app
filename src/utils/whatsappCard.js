import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

/**
 * Normalise a stored member phone into the digits-only international form
 * wa.me expects. Older members were saved as bare 10-digit numbers, so those
 * get the +91 default the add-member form uses.
 */
export const toWhatsAppNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  return digits.length > 10 ? digits : null;
};

const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches;

// The card page (api/card.js) only exists on the deployed site.
const shareOrigin = () => (/^(localhost|127\.|192\.168\.)/.test(window.location.hostname) ? 'https://gymly.online' : window.location.origin);

// WhatsApp only renders link previews for reasonably small images, so the
// uploaded copy is a 1200px JPEG rather than the 2x PNG used for downloads.
const toPreviewJpeg = (canvas) => new Promise((resolve, reject) => {
  const w = 1200;
  const h = Math.round((canvas.height / canvas.width) * w);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, w, h);
  out.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render card'))), 'image/jpeg', 0.85);
});

/**
 * Open the member's own WhatsApp chat with the message + card ready to send.
 *
 * Browsers can't attach a file to a specific chat, so the card is uploaded and
 * linked: WhatsApp shows the link as a large card-image preview in the chat,
 * so the member receives card and text together.
 *
 * Call it straight from the click handler — on desktop the new tab is opened
 * before any await so the popup blocker allows it.
 */
export async function sendCardToMemberChat({ canvas, member, gymId, gymName }) {
  const phone = toWhatsAppNumber(member?.phone);
  if (!phone) throw new Error('No valid WhatsApp number for this member');

  const tab = isTouchDevice() ? null : window.open('', '_blank');
  if (tab) tab.document.title = 'Opening WhatsApp…';

  try {
    const jpeg = await toPreviewJpeg(canvas);
    const cardRef = ref(storage, `members/${gymId}/${member.id}/membership_card.jpg`);
    await uploadBytes(cardRef, jpeg, { contentType: 'image/jpeg', cacheControl: 'public,max-age=300' });
    const token = new URL(await getDownloadURL(cardRef)).searchParams.get('token');

    // v= busts WhatsApp's preview cache so a renewed card never shows the old one.
    const link = `${shareOrigin()}/api/card?g=${encodeURIComponent(gymId)}&m=${encodeURIComponent(member.id)}&t=${token}&v=${Date.now().toString(36)}`;
    const text = `Hi ${member.name}! 🏋️ Here is your membership card from ${gymName || 'Gymly'}.\n\n${link}`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

    if (tab) tab.location.href = waUrl;
    else window.location.href = waUrl;
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Draw an image into a circle, cropped like object-fit: cover (no stretching). */
export function drawCircleImageCover(ctx, img, cx, cy, r) {
  const size = Math.min(img.width, img.height);
  const sx = (img.width - size) / 2;
  const sy = (img.height - size) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, sx, sy, size, size, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}
