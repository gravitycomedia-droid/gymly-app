#!/usr/bin/env node
/**
 * Extracts the Material Symbols icon names this app can render, so index.html
 * can request a subset font (`&icon_names=...`) instead of the full 1.12 MB
 * variable face.
 *
 * A missed name renders as literal text ("fitness_center") in the UI, so the
 * extraction deliberately errs towards over-inclusion:
 *
 *   Tier A — names we are sure about: JSX text inside a `material-symbols`
 *            element, and `icon:` / `icon=` config properties.
 *   Tier B — every other string literal in src/ that happens to be a real
 *            Material Symbols name. This is what catches icons referenced
 *            through variables (`{item.icon}`, ternaries, lookup maps).
 *
 * Tier B costs a few hundred bytes per extra glyph and removes the entire class
 * of "we forgot the dynamic one" bugs, which is a trade worth making.
 *
 * Usage:
 *   node scripts/extractIconNames.cjs           print the icon_names= list
 *   node scripts/extractIconNames.cjs --json    machine-readable breakdown
 *   node scripts/extractIconNames.cjs --check    fail if index.html is missing
 *                                                any icon the source renders
 *
 * The metadata list is cached in scripts/.cache/material-symbols.json.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const CACHE = path.join(__dirname, '.cache', 'material-symbols.json');
const METADATA_URL =
  'https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols';

// ── the official name list ──────────────────────────────────────────────────

function fetchMetadata() {
  return new Promise((resolve, reject) => {
    https
      .get(METADATA_URL, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`metadata fetch failed: HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body.replace(/^\)\]\}'/, '')));
      })
      .on('error', reject);
  });
}

async function officialNames() {
  if (!fs.existsSync(CACHE)) {
    const json = await fetchMetadata();
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    const names = JSON.parse(json).icons.map((i) => i.name).sort();
    fs.writeFileSync(CACHE, JSON.stringify(names));
  }
  return new Set(JSON.parse(fs.readFileSync(CACHE, 'utf8')));
}

// ── source scanning ─────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const NAME = '[a-z][a-z0-9_]*';

function scan(files) {
  const certain = new Map(); // name -> Set(files)
  const possible = new Map();

  const add = (map, name, file) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(path.relative(ROOT, file));
  };

  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8');

    // Tier A.1 — JSX text inside an element carrying the icon class or font.
    // Matches across the whole opening tag, so multi-line JSX is covered.
    const el = new RegExp(
      `(?:material-symbols|Material Symbols Outlined)[^>]*>\\s*(${NAME})\\s*<`,
      'g'
    );
    for (const m of code.matchAll(el)) add(certain, m[1], file);

    // Tier A.2 — icon config properties: icon: 'x', icon="x", icon={'x'}
    const prop = new RegExp(`\\bicon\\s*[:=]\\s*\\{?\\s*['"\`](${NAME})['"\`]`, 'gi');
    for (const m of code.matchAll(prop)) add(certain, m[1], file);

    // Tier A.3 — any JSX text node that is a single bare snake_case word.
    // Catches icons styled inline rather than by class, e.g. the `sym` style
    // object in ReceptionistDashboard.jsx:
    //   <span style={{ ...sym, fontSize: 24 }}>fitness_center</span>
    // Non-icon words are filtered out by the official-name check below.
    const text = new RegExp(`>\\s*(${NAME})\\s*<`, 'g');
    for (const m of code.matchAll(text)) add(possible, m[1], file);

    // Tier B — every string literal that is a real icon name.
    const lit = new RegExp(`['"\`](${NAME})['"\`]`, 'g');
    for (const m of code.matchAll(lit)) add(possible, m[1], file);
  }

  return { certain, possible };
}

// ── report ──────────────────────────────────────────────────────────────────

(async () => {
  const official = await officialNames();
  const { certain, possible } = scan(walk(SRC));

  const confirmed = [...certain.keys()].filter((n) => official.has(n)).sort();
  const rejected = [...certain.keys()].filter((n) => !official.has(n)).sort();
  const inferred = [...possible.keys()]
    .filter((n) => official.has(n) && !certain.has(n))
    .sort();

  const final = [...new Set([...confirmed, ...inferred])].sort();

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ final, confirmed, inferred, rejected }, null, 2));
    return;
  }

  // --check: the subset font in index.html must cover every icon the source can
  // render, otherwise those icons show up as literal text in the UI.
  if (process.argv.includes('--check')) {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const declared = new Set((html.match(/icon_names=([a-z0-9_,]+)/)?.[1] || '').split(','));
    const missing = final.filter((n) => !declared.has(n));

    if (!declared.size) {
      console.error('index.html has no icon_names= subset — nothing to check.');
      process.exit(1);
    }
    if (missing.length) {
      console.error(
        `index.html is missing ${missing.length} icon(s); they will render as ` +
          `literal text:\n  ${missing.join(', ')}\n\n` +
          `Run \`npm run icons\` and paste the list into index.html.`
      );
      process.exit(1);
    }
    console.log(`OK — all ${final.length} rendered icons are in the subset.`);
    return;
  }

  console.log(`official Material Symbols names : ${official.size}`);
  console.log(`Tier A (icon markup / config)   : ${confirmed.length}`);
  console.log(`Tier B (string literals, extra) : ${inferred.length}`);
  console.log(`TOTAL to request                : ${final.length}\n`);

  if (rejected.length) {
    console.log(
      'Tier A names that are NOT real icons (config keys, safe to ignore):\n  ' +
        rejected.join(', ') +
        '\n'
    );
  }

  console.log('icon_names=' + final.join(','));
})();
