"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const caps = require("../src/protocol/caps");
const { adapterFor, ta2, ac3 } = require("../src/protocol/adapters");

// ── caps detection ──────────────────────────────────────────────────────────
test("caps: TA 2.x pushver below 2.4 keeps FINGERTMP", () => {
  const { caps: c } = caps.mergeCaps(undefined, caps.capsFromQuery({ SN: "X", options: "all", pushver: "2.2.14" }));
  assert.equal(c.protocol, "ta2");
  assert.equal(c.templateTable, "FINGERTMP");
  assert.equal(c.pushver, "2.2.14");
});

test("caps: pushver >= 2.4.0 switches to BIODATA", () => {
  assert.equal(caps.capsFromPushver("2.4.1").templateTable, "BIODATA");
  assert.equal(caps.capsFromPushver("2.4.0").templateTable, "BIODATA");
  assert.equal(caps.capsFromPushver("2.3.9").templateTable, undefined);
});

test("caps: /iclock/registry or pushver >= 3 means AC 3.x with templatev10", () => {
  assert.deepEqual(caps.capsFromEndpoint("registry"), { protocol: "ac3", templateTable: "templatev10", deviceType: "acc" });
  assert.equal(caps.capsFromPushver("3.1.2").protocol, "ac3");
  // A later BIODATA hint never drags an AC device back to TA tables.
  const { caps: c } = caps.mergeCaps({ protocol: "ac3" }, caps.capsFromBiodataUpload({ type: 1, majorVer: 12 }));
  assert.equal(c.templateTable, "templatev10");
});

test("caps: INFO / options content gives model, firmware and fpAlgo", () => {
  const p = caps.capsFromInfo({ devicename: "K40/ID", fwversion: "Ver 6.60", zkfpversion: "10", pushversion: "2.4.1" });
  assert.deepEqual([p.model, p.fwVersion, p.fpAlgo, p.templateTable], ["K40/ID", "Ver 6.60", 10, "BIODATA"]);
  assert.equal(caps.capsFromInfoParam("Ver 6.60 Apr 2 2020,12,3,240,192.168.1.20,10,7,12,15").fpAlgo, 10);
});

test("caps: USER upload sets the userinfo dialect the device itself uses", () => {
  const { caps: c } = caps.mergeCaps({ userinfoDialect: "pri" }, caps.capsFromUserLine("privilege"));
  assert.equal(c.userinfoDialect, "privilege");
});

test("caps: mergeCaps reports only real changes", () => {
  const first = caps.mergeCaps(undefined, { fpAlgo: 10 });
  assert.equal(first.changed, true);
  const again = caps.mergeCaps(first.caps, { fpAlgo: 10 });
  assert.equal(again.changed, false);
  assert.deepEqual(again.patch, {});
});

// ── template algorithm matching ─────────────────────────────────────────────
const tpl = { type: 1, fingerIndex: 2, subIndex: 0, majorVer: 10, minorVer: 0, tmp: "QUJD" };

test("template push: matching algorithm → FINGERTMP or BIODATA by target caps", () => {
  const fingertmp = ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: 10 }, 1000, tpl);
  assert.equal(fingertmp.type, "FP_UPSERT");
  assert.equal(fingertmp.cmd, "DATA UPDATE FINGERTMP PIN=1000\tFID=2\tSize=4\tValid=1\tTMP=QUJD");
  const biodata = ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: 10, templateTable: "BIODATA" }, 1000, tpl);
  assert.equal(biodata.type, "BIODATA_UPSERT");
  assert.match(biodata.cmd, /^DATA UPDATE BIODATA Pin=1000\tNo=2\tIndex=0\t.*MajorVer=10\t.*Tmp=QUJD$/);
});

test("template push: algorithm mismatch or unknown → no command (re-enroll)", () => {
  assert.equal(ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: 12 }, 1000, tpl), null);
  assert.equal(ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: null }, 1000, tpl), null);
  assert.equal(ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: 10 }, 1000, { ...tpl, majorVer: null }), null);
  assert.equal(ta2.templateCommand({ ...caps.DEFAULT_CAPS, fpAlgo: 10 }, 1000, { ...tpl, type: 9 }), null);
  assert.equal(adapterFor({ protocol: "ac3", fpAlgo: 10 }).templateCommand({ protocol: "ac3", fpAlgo: 10 }, 1000, tpl), null);
});

test("enroll command follows the template table", () => {
  assert.deepEqual(ta2.enrollCommand({ templateTable: "FINGERTMP" }, 1000, 6), { kind: "ENROLL_FP", cmd: "ENROLL_FP PIN=1000\tFID=6\tRETRY=3\tOVERWRITE=1" });
  assert.deepEqual(ta2.enrollCommand({ templateTable: "BIODATA" }, 1000, 6), { kind: "ENROLL_BIO", cmd: "ENROLL_BIO TYPE=1\tPIN=1000\tNO=6\tRETRY=3\tOVERWRITE=1" });
  assert.equal(ac3.enrollCommand({ protocol: "ac3" }, 1000, 6), null);
});

// ── AC 3.x scaffold parsers ─────────────────────────────────────────────────
test("rtlog: verified punches parsed as IST, other events ignored", () => {
  const body = [
    "time=2026-10-03 06:15:00\tpin=1000\tcardno=0\teventaddr=1\tevent=0\tinoutstatus=0\tverifytype=1\tindex=12",
    "time=2026-10-03 06:15:05\tpin=0\tcardno=0\teventaddr=1\tevent=27\tinoutstatus=0\tverifytype=200\tindex=13",
    "time=bad\tpin=1001\tevent=0\tverifytype=1",
  ].join("\r\n");
  const { records, ignored, errors } = ac3.parseRtlog(body);
  assert.equal(records.length, 1);
  assert.equal(records[0].pin, "1000");
  assert.equal(new Date(records[0].timeMs).toISOString(), "2026-10-03T00:45:00.000Z");
  assert.equal(records[0].verifyMode, "fingerprint");
  assert.equal(ignored.length, 1);
  assert.equal(errors[0].reason, "bad_time");
});

test("AC user and templatev10 tables parse into roster items", () => {
  const users = ac3.parseRoster("user uid=1\tcardno=\tpin=1000\tpassword=\tgroup=1\tstarttime=0\tendtime=0\tname=Ravi\tprivilege=0", "user");
  assert.equal(users[0].kind, "USER");
  assert.equal(users[0].dialect, "privilege");
  const tmps = ac3.parseRoster("templatev10 size=4\tuid=1\tpin=1000\tfingerid=3\tvalid=1\ttemplate=QUJD\tresverse=0\tendtag=0", "templatev10");
  assert.equal(tmps[0].kind, "TEMPLATEV10");
  assert.equal(tmps[0].fingerIndex, 3);
  assert.equal(tmps[0].tmp, "QUJD");
  assert.ok(!tmps[0].rawLine.includes("QUJD"));
});

test("AC registry / push responses", () => {
  assert.equal(ac3.registryResponse("abc123"), "RegistryCode=abc123");
  const kv = ac3.parseRegistry("DeviceType=acc,~DeviceName=SpeedFace-V5L,FirmVer=ZAM180,PushVersion=3.1.2");
  assert.equal(kv.devicename, "SpeedFace-V5L");
  assert.match(ac3.pushConfig({ sessionId: "S1" }), /^SessionID=S1$/m);
  assert.equal(ta2.tableKind("ATTLOG"), "punches");
  assert.equal(ac3.tableKind("rtlog"), "punches");
});
