# Gymly — Membership Card Download Fix
### Antigravity IDE Prompt

---

## CONTEXT

Read AGENTS.md first. This is a targeted fix for the **digital membership card** in Gymly (React + Firebase SaaS, live at gymly.online).

The card renders perfectly in the browser but has 4 bugs when downloaded as a PNG via `html2canvas`:

1. **Name is cut in half** — truncated or clipped mid-character
2. **Enrollment number drops below** where it should be
3. **"Expiring" / "Active" badge disappears behind the background** (z-index / stacking issue)
4. **Name in the avatar circle is vertically off** — renders too low

**Root cause:** `html2canvas` does not reliably capture:
- `position: absolute` / `position: relative` stacking
- CSS `background: linear-gradient(...)` on nested elements
- `overflow: hidden` clipping
- CSS `transform` or `translateY` on text
- Flexbox `gap` and `align-items: center` in some configurations
- `letter-spacing`, `text-transform`, `backdrop-filter`

---

## THE FIX STRATEGY

**Do NOT just tweak html2canvas options.** That is a dead end.

The correct fix is to **rebuild the card as a self-contained `<canvas>` drawing** OR use a **pure SVG card** that html2canvas captures reliably. The recommended approach is:

### Approach: Dual-render card

1. **Keep the existing CSS card** exactly as-is for the visual display in the modal (it looks correct in the browser — do not touch it)
2. **Add a hidden off-screen `<canvas>` element** that redraws the card using the Canvas 2D API with hardcoded pixel positions — no CSS involved
3. When the user clicks "Download Card", call the canvas draw function → `canvas.toDataURL('image/png')` → trigger download
4. When the user clicks "Share Card on WhatsApp", use the same canvas-drawn PNG

This guarantees pixel-perfect output that matches the browser card exactly.

---

## EXACT BUGS TO FIX (with cause)

| Bug | Cause | Fix |
|-----|-------|-----|
| Name cut in half | `overflow: hidden` + `html2canvas` clips text before font loads | Draw text directly on canvas with `ctx.fillText()`, no clipping |
| Enrollment no. misaligned | Absolute positioning inside a flex container loses offset in canvas | Use explicit `y` coordinates in canvas draw |
| Badge behind background | `z-index` is ignored by `html2canvas` in some stacking contexts | Draw badge last (top of draw stack) in canvas |
| Avatar letter too low | `line-height` / `vertical-align` not rendered by html2canvas | Use `ctx.textBaseline = 'middle'` on canvas |

---

## IMPLEMENTATION INSTRUCTIONS

### Step 1 — Find the card component

Find the membership card component. It is likely in one of:
- `src/components/MemberCard.jsx`
- `src/components/MembershipCard.jsx`
- `src/pages/owner/members/` — a card modal or card component
- Search for `html2canvas` import to find the exact file

Show the file path and current `downloadCard` or `handleDownload` function before making any changes.

---

### Step 2 — Add the hidden canvas renderer

Inside the same component file, add this canvas draw function. Adapt field names to match the actual data props in the existing component:

```javascript
const drawCardToCanvas = (member, gymName) => {
  // Card dimensions — standard credit card ratio 1.586:1 at 2x resolution
  const W = 800;
  const H = 504;
  const R = 20; // corner radius

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── BACKGROUND GRADIENT ──────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1a1060');
  grad.addColorStop(0.5, '#2d1b8e');
  grad.addColorStop(1, '#1e1480');
  
  // Rounded rectangle clip
  ctx.beginPath();
  ctx.moveTo(R, 0);
  ctx.lineTo(W - R, 0);
  ctx.arcTo(W, 0, W, R, R);
  ctx.lineTo(W, H - R);
  ctx.arcTo(W, H, W - R, H, R);
  ctx.lineTo(R, H);
  ctx.arcTo(0, H, 0, H - R, R);
  ctx.lineTo(0, R);
  ctx.arcTo(0, 0, R, 0, R);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  ctx.clip(); // clip everything inside rounded rect

  // ── DECORATIVE BLOBS (background circles) ────────────
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#7c6ef5';
  ctx.beginPath(); ctx.arc(W - 80, 60, 120, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(W - 40, H - 20, 90, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  // ── GYM NAME (top left) ──────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(gymName?.toUpperCase() || 'GYM', 44, 40);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillText('GYMLY MEMBER CARD', 44, 74);

  // ── STATUS BADGE (top right) — drawn LAST but placed here for layout ──
  // (we will draw this after everything else so it is always on top)

  // ── SEPARATOR LINE ────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(44, H - 110);
  ctx.lineTo(W - 44, H - 110);
  ctx.stroke();

  // ── AVATAR CIRCLE ────────────────────────────────────
  const avatarX = 80, avatarY = 160, avatarR = 52;
  // Gradient fill for avatar
  const avatarGrad = ctx.createRadialGradient(
    avatarX - 10, avatarY - 10, 5,
    avatarX, avatarY, avatarR
  );
  avatarGrad.addColorStop(0, '#b8d8f8');
  avatarGrad.addColorStop(1, '#6baed6');
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = avatarGrad;
  ctx.fill();

  // Avatar initial letter — perfectly centered
  const initial = (member.name || 'M').charAt(0).toUpperCase();
  ctx.fillStyle = '#1a6b3a';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle'; // ← critical: fixes the "letter too low" bug
  ctx.fillText(initial, avatarX, avatarY);

  // Reset alignment
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // ── MEMBER NAME ───────────────────────────────────────
  // Measure and truncate if necessary to prevent clipping
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  const nameText = member.name || 'Member';
  const maxNameWidth = 340; // space before QR code
  let displayName = nameText;
  while (ctx.measureText(displayName).width > maxNameWidth && displayName.length > 1) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== nameText) displayName += '…';
  ctx.fillText(displayName, 152, 130);

  // ── PLAN NAME ────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.fillText(member.planName || member.plan || 'Membership', 152, 174);

  // ── ENROLLMENT / MEMBER NUMBER BADGE ─────────────────
  const enrollText = member.memberNumber || member.enrollmentNo || member.memberId || 'N/A';
  const enrollY = 210;
  const enrollPadX = 16, enrollPadY = 8;
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  const enrollWidth = ctx.measureText(enrollText).width + enrollPadX * 2;

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.roundRect(152, enrollY, enrollWidth, 34, 6);
  ctx.fill();

  ctx.fillStyle = '#4ade80'; // green color for enrollment no
  ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(enrollText, 152 + enrollPadX, enrollY + 17);
  ctx.textBaseline = 'top';

  // ── QR CODE ───────────────────────────────────────────
  // Generate QR code URL (same as the one shown in the browser card)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
    `https://gymly.online/member/${member.id || member.uid}`
  )}&bgcolor=ffffff&color=000000&margin=8`;

  // Load QR code image asynchronously
  const qrImg = new Image();
  qrImg.crossOrigin = 'anonymous';
  qrImg.onload = () => {
    // Draw white rounded background for QR
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(W - 200, 110, 156, 156, 12);
    ctx.fill();
    ctx.drawImage(qrImg, W - 196, 114, 148, 148);

    // ── VALID TILL + PHONE (bottom section) ──────────────
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('VALID TILL', 44, H - 95);
    ctx.fillText('PHONE', 240, H - 95);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    // Format expiry date
    const expiry = member.subscriptionExpiry?.toDate
      ? member.subscriptionExpiry.toDate()
      : new Date(member.subscriptionExpiry || member.expiryDate);
    const dateStr = expiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    ctx.fillText(dateStr, 44, H - 72);

    const phone = member.phone ? `+91${member.phone.replace(/^\+91/, '')}` : (member.phoneNumber || '');
    ctx.fillText(phone, 240, H - 72);

    // ── STATUS BADGE — drawn last so it's always on top ──
    const now = new Date();
    const expiryDate = expiry;
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    let badgeColor, dotColor, badgeText;
    if (daysLeft < 0) {
      badgeColor = 'rgba(239,68,68,0.25)';
      dotColor = '#ef4444';
      badgeText = 'Expired';
    } else if (daysLeft <= 15) {
      badgeColor = 'rgba(251,146,60,0.25)';
      dotColor = '#f97316';
      badgeText = 'Expiring';
    } else {
      badgeColor = 'rgba(74,222,128,0.2)';
      dotColor = '#4ade80';
      badgeText = 'Active';
    }

    // Badge background — drawn LAST so nothing covers it
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    const badgeW = ctx.measureText(badgeText).width + 44;
    const badgeX = W - badgeW - 44;
    const badgeY = 34;
    const badgeH = 34;

    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();

    // Dot
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(badgeX + 14, badgeY + badgeH / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Badge text
    ctx.fillStyle = dotColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + 26, badgeY + badgeH / 2);

    ctx.restore(); // end clip

    // ── TRIGGER DOWNLOAD ─────────────────────────────────
    const link = document.createElement('a');
    link.download = `Gymly_Card_${(member.name || 'Member').replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  qrImg.onerror = () => {
    // QR failed to load — still download without it
    ctx.restore();
    const link = document.createElement('a');
    link.download = `Gymly_Card_${(member.name || 'Member').replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  qrImg.src = qrUrl;
};
```

---

### Step 3 — Replace the download handler

Find the existing `downloadCard` or `handleDownload` function. Replace it with:

```javascript
const handleDownloadCard = () => {
  drawCardToCanvas(member, gymName);
};
```

Remove any existing `html2canvas` import and call — it is no longer needed for the card download.

---

### Step 4 — Update the WhatsApp share button

The "Share Card on WhatsApp" button currently shares a URL or image. Update it to use the canvas-generated PNG:

```javascript
const handleShareOnWhatsApp = () => {
  // Generate the canvas PNG first, then share via WhatsApp Web
  // (WhatsApp Web doesn't support direct file share from browser — 
  // keep the existing WhatsApp message link OR show a "download first, then share" hint)
  
  // Option A: Keep existing WhatsApp URL share (recommended — no change needed)
  // Option B: Open WhatsApp with a message linking to the member's public card page
  const message = `Here is your Gymly membership card for ${member.name}. View it at: https://gymly.online/card/${member.id}`;
  window.open(`https://wa.me/${member.phone}?text=${encodeURIComponent(message)}`, '_blank');
};
```

---

### Step 5 — Remove html2canvas dependency (optional cleanup)

If `html2canvas` is no longer used anywhere else in the project, remove the import:

```javascript
// Remove this line if present:
// import html2canvas from 'html2canvas';
```

Check if it's used in any other file before removing.

---

## FIELD NAME MAPPING

Before implementing, read the actual member object structure from the existing card component or from the Firestore `users` collection. Map these canvas fields to the real field names:

| Canvas variable | Check for these field names in the member object |
|----------------|--------------------------------------------------|
| `member.name` | `name`, `memberName`, `fullName` |
| `member.planName` | `planName`, `plan`, `membershipPlan`, `planType` |
| `member.memberNumber` | `memberNumber`, `enrollmentNo`, `memberId`, `memberCode` |
| `member.subscriptionExpiry` | `subscriptionExpiry`, `expiryDate`, `membershipExpiry`, `validTill` |
| `member.phone` | `phone`, `phoneNumber`, `mobile` |
| `member.id` | `id`, `uid`, `memberId` |
| `gymName` | from `gymData.name`, `gym.name`, or context |

Show the diff — do not apply until confirmed.

---

## WHAT NOT TO CHANGE

- Do NOT modify the CSS card that renders in the modal — it looks correct in the browser
- Do NOT change any other component
- Do NOT upgrade or downgrade any dependency
- Do NOT change Firestore rules or Cloud Functions

---

## VERIFICATION

After implementing:

1. Open a member profile in the owner dashboard
2. Click the card to open the modal
3. Click "Download Card"
4. The downloaded PNG should show:
   - ✅ Full name, not cut off
   - ✅ Enrollment number inline below the name (not dropped)
   - ✅ Status badge (Active / Expiring / Expired) clearly visible in the top right
   - ✅ Avatar initial perfectly centered in the circle
   - ✅ QR code in the top right
   - ✅ Valid Till date and phone number in the bottom section
5. Test with a member whose name is long (e.g. "Rajesh Kumar Sharma") to verify truncation works correctly

---

## IMPORTANT NOTE ON `ctx.roundRect`

`ctx.roundRect()` is available in Chrome 99+ and modern browsers. If the app needs to support older WebViews or older Android browsers, replace `ctx.roundRect(x, y, w, h, r)` with this polyfill helper at the top of the function:

```javascript
const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};
```

Then replace all `ctx.roundRect(...)` calls with `roundRect(ctx, ...)`.

---

*End of prompt*
*Target: pixel-perfect card download with zero html2canvas dependency*
