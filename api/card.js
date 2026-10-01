/* global process */
// Membership card share page.
//
// The WhatsApp share sends the member a link to this page. WhatsApp reads the
// og:image below and shows the card as a large image preview inside the chat,
// so the member gets card + message in one bubble. Opening the link shows the
// card full-size.
//
// Only ever points at a member card in this project's Storage bucket — the
// ids and the download token are format-checked, nothing else is accepted.

const BUCKET = process.env.VITE_FIREBASE_STORAGE_BUCKET || 'gymly-app-06.firebasestorage.app';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TOKEN_RE = /^[0-9a-f-]{36}$/i;

export default function handler(req, res) {
  const { g, m, t } = req.query || {};
  if (!ID_RE.test(g || '') || !ID_RE.test(m || '') || !TOKEN_RE.test(t || '')) {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('Invalid card link');
    return;
  }

  const img = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/members%2F${g}%2F${m}%2Fmembership_card.jpg?alt=media&token=${t}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Membership Card</title>
<meta property="og:type" content="website">
<meta property="og:title" content="Your Membership Card">
<meta property="og:description" content="Show this card at the gym front desk.">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="756">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img}">
<style>
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 16px; box-sizing: border-box; background: #14152b; font-family: system-ui, -apple-system, sans-serif; }
  img { width: 100%; max-width: 600px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
  a { color: #fff; background: #6c63c7; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 700; }
</style>
</head>
<body>
<img src="${img}" alt="Membership card">
<a href="${img}" download="membership_card.jpg">Download card</a>
</body>
</html>`);
}
