"use strict";

// OPERLOG and the "roster" tables (USERINFO, FINGERTMP, BIODATA, and the AC
// 3.x `user` / `templatev10` tables). Each line normally starts with a
// keyword and a space:
//   FP PIN=1000\tFID=0\tSize=1024\tValid=1\tTMP=<base64>
//   USER PIN=1000\tName=Ravi\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=...
//   OPLOG 4\t0\t2026-10-03 06:15:00\t...
//   BIODATA Pin=1000\tNo=0\tIndex=0\t...\tTmp=<base64>
// Responses to DATA QUERY (table=USERINFO/FINGERTMP/BIODATA) may omit the
// keyword, so the table name decides the kind for un-prefixed lines.

const { splitLines, parseKv, toInt, redactTemplates } = require("./kv");
const { parseBiodataFields } = require("./biodata");

const TABLE_KIND = {
  USERINFO: "USER",
  USER: "USER",
  FINGERTMP: "FP",
  BIODATA: "BIODATA",
  TEMPLATEV10: "TEMPLATEV10",
};

const PREFIX_RE = /^(FP|USER|OPLOG|BIODATA|USERPIC|BIOPHOTO|FACE|ATTPHOTO|templatev10|user)\s+(.*)$/;

function parseUser(kv) {
  const keys = kv.__keys || [];
  let dialect = null;
  if (keys.includes("Privilege") || keys.includes("privilege")) dialect = "privilege";
  else if (keys.includes("Pri") || keys.includes("pri")) dialect = "pri";
  return {
    pin: kv.pin != null ? String(kv.pin).trim() : null,
    name: kv.name != null ? kv.name : null,
    privilege: toInt(kv.pri != null ? kv.pri : kv.privilege),
    dialect,
  };
}

function parseFp(kv) {
  return {
    pin: kv.pin != null ? String(kv.pin).trim() : null,
    fingerIndex: toInt(kv.fid, 0),
    size: toInt(kv.size),
    valid: toInt(kv.valid, 1),
    tmp: kv.tmp || "",
  };
}

// AC 3.x templatev10: pin=..\tfingerid=..\tsize=..\tvalid=..\ttemplate=..
function parseTemplateV10(kv) {
  return {
    pin: kv.pin != null ? String(kv.pin).trim() : null,
    fingerIndex: toInt(kv.fingerid, 0),
    size: toInt(kv.size),
    valid: toInt(kv.valid, 1),
    tmp: kv.template || "",
  };
}

function parseOperlog(body, table = "OPERLOG") {
  const items = [];
  const tableKind = TABLE_KIND[String(table || "").toUpperCase()] || null;
  for (const line of splitLines(body)) {
    const m = PREFIX_RE.exec(line);
    let kind;
    let rest;
    if (m) {
      kind = m[1].toUpperCase();
      rest = m[2];
    } else if (tableKind) {
      kind = tableKind;
      rest = line;
    } else {
      items.push({ kind: "UNKNOWN", rawLine: redactTemplates(line) });
      continue;
    }
    const safeRaw = redactTemplates(line);
    if (kind === "USER") {
      items.push({ kind, ...parseUser(parseKv(rest)), rawLine: safeRaw });
    } else if (kind === "FP") {
      items.push({ kind, ...parseFp(parseKv(rest)), rawLine: safeRaw });
    } else if (kind === "BIODATA") {
      items.push({ kind, ...parseBiodataFields(rest), rawLine: safeRaw });
    } else if (kind === "TEMPLATEV10") {
      items.push({ kind, ...parseTemplateV10(parseKv(rest)), rawLine: safeRaw });
    } else if (kind === "OPLOG") {
      items.push({ kind, rawLine: safeRaw });
    } else {
      // USERPIC / BIOPHOTO / FACE / ATTPHOTO — logged only in v1.
      items.push({ kind: "UNSUPPORTED", subKind: kind, rawLine: safeRaw });
    }
  }
  return items;
}

module.exports = { parseOperlog };
