"use strict";

// POST /iclock/devicecmd — command results (T4). One body may hold several
// results, one per line:
//   ID=12&Return=0&CMD=DATA
//   ID=13&Return=-1002&CMD=DATA
// Some commands (INFO, GET OPTION) carry multi-line content after the result
// line, either as `&Content=...` or as the following lines until the next
// `ID=` line:
//   ID=7&Return=0&CMD=INFO
//   ~DeviceName=K40
//   FWVersion=Ver 6.60 ...
// Results never carry DATA QUERY payloads; those arrive on cdata (T5).

const { splitLines, parseKv } = require("./kv");

const HEAD_RE = /^ID=([^&\s]+)&Return=(-?\d+)(?:&CMD=([^&]*))?(?:&(.*))?$/i;

function parseDeviceCmd(body) {
  const results = [];
  const errors = [];
  let current = null;
  for (const line of splitLines(body)) {
    const m = HEAD_RE.exec(line.trim());
    if (m) {
      current = {
        id: m[1],
        seq: /^\d+$/.test(m[1]) ? Number(m[1]) : null,
        returnCode: Number(m[2]),
        cmd: m[3] || null,
        contentLines: [],
      };
      if (m[4]) {
        const tail = m[4].replace(/^Content=/i, "");
        if (tail) current.contentLines.push(tail);
      }
      results.push(current);
    } else if (current) {
      current.contentLines.push(line);
    } else {
      errors.push({ line, reason: "no_result_header" });
    }
  }
  for (const r of results) {
    r.content = r.contentLines.join("\n");
    // INFO / GET OPTION content: key=value per line (or comma-separated).
    r.contentKv = r.contentLines.length
      ? parseKv(r.contentLines.join("\n").replace(/,(?=~?[A-Za-z][\w~]*=)/g, "\n"), "\n")
      : {};
    delete r.contentLines;
  }
  return { results, errors };
}

module.exports = { parseDeviceCmd };
