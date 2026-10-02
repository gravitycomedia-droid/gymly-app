"use strict";

// functions/src/bio/commands.js is a copy of the gateway's pure builders
// (Functions deploy only functions/). This keeps the two byte-identical.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");

const fn = require("../src/bio/commands");
const gwDir = path.join(__dirname, "../../bio-gateway/src/protocol");
const SKIP = !fs.existsSync(gwDir) && "bio-gateway not present";

test("command builders match the gateway byte-for-byte", { skip: SKIP }, () => {
  const gw = require(path.join(gwDir, "commands"));
  const gwBio = require(path.join(gwDir, "biodata"));
  const gwTa2 = require(path.join(gwDir, "adapters/ta2"));
  const names = ["Ravi Kumar", "Ravi\tPri=14\nC:9:REBOOT", "José 💪", "రవి", "A".repeat(40), "a=b", ""];
  for (const n of names) {
    for (const d of ["pri", "privilege"]) assert.equal(fn.userUpsert(1000, n, d), gw.userUpsert(1000, n, d), `${n}/${d}`);
  }
  assert.equal(fn.userDelete(1234), gw.userDelete(1234));
  assert.equal(fn.fpUpsert(1000, 3, "QUJD"), gw.fpUpsert(1000, 3, "QUJD"));
  assert.equal(fn.enrollFp(1000, 3), gw.enrollFp(1000, 3));
  assert.equal(fn.enrollBio(1000, 3), gw.enrollBio(1000, 3));
  const t = { pin: 1000, fingerIndex: 3, subIndex: 0, majorVer: 12, minorVer: 0, tmp: "Zm9v" };
  assert.equal(fn.biodataUpsert(t), gwBio.buildBiodataUpsert(t));
  const tpl = { type: 1, fingerIndex: 2, majorVer: 10, minorVer: 0, tmp: "QUJD" };
  for (const caps of [
    { protocol: "ta2", templateTable: "FINGERTMP", fpAlgo: 10 },
    { protocol: "ta2", templateTable: "BIODATA", fpAlgo: 10 },
    { protocol: "ta2", templateTable: "FINGERTMP", fpAlgo: 12 },
    { protocol: "ta2", templateTable: "FINGERTMP", fpAlgo: null },
  ]) {
    assert.deepEqual(fn.templateCommand(caps, 1000, tpl), gwTa2.templateCommand(caps, 1000, tpl), JSON.stringify(caps));
  }
  for (const bad of [0, 999, -1, 1.5, "x", null]) {
    assert.throws(() => fn.userUpsert(bad, "x"));
    assert.throws(() => gw.userUpsert(bad, "x"));
  }
});
