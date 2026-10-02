"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { istWallClockToMillis, istDateKey, istCompact } = require("../src/time/ist");
const { parseAttlog } = require("../src/protocol/attlog");
const { parseOperlog } = require("../src/protocol/operlog");
const { parseDeviceCmd } = require("../src/protocol/devicecmd");
const cmd = require("../src/protocol/commands");
const { parseBiodataFields, buildBiodataUpsert } = require("../src/protocol/biodata");
const { buildHandshake } = require("../src/protocol/handshake");
const { redactTemplates } = require("../src/protocol/kv");

const iso = (ms) => new Date(ms).toISOString();

// ── IST (T7) ────────────────────────────────────────────────────────────────
test("IST: 2026-10-03 06:15:00 → 2026-10-03T00:45:00Z", () => {
  assert.equal(iso(istWallClockToMillis("2026-10-03 06:15:00")), "2026-10-03T00:45:00.000Z");
});

test("IST: date key and compact id use the IST wall clock", () => {
  const ms = istWallClockToMillis("2026-10-03 00:10:05");
  assert.equal(iso(ms), "2026-10-02T18:40:05.000Z");
  assert.equal(istDateKey(ms), "2026-10-03");
  assert.equal(istCompact(ms), "20261003001005");
});

test("IST: malformed times are rejected, not guessed", () => {
  for (const s of ["2026-10-03", "03/10/2026 06:15", "2026-02-30 10:00:00", "2026-10-03 25:00:00", ""]) {
    assert.equal(istWallClockToMillis(s), null, s);
  }
});

// ── ATTLOG ──────────────────────────────────────────────────────────────────
test("ATTLOG: valid lines, extra trailing fields, mixed \\r\\n and \\n", () => {
  const body = "1000\t2026-10-03 06:15:00\t0\t1\t0\t0\t0\r\n1001\t2026-10-03 06:16:00\t0\t1\n1002\t2026-10-03 06:17:00\t1\t15\t\t255\t0\t0\t0\r\n";
  const { records, errors } = parseAttlog(body);
  assert.equal(errors.length, 0);
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((r) => r.pin), ["1000", "1001", "1002"]);
  assert.equal(iso(records[0].timeMs), "2026-10-03T00:45:00.000Z");
  assert.equal(records[0].verifyMode, "fingerprint");
  assert.equal(records[2].verifyMode, "face");
  assert.equal(records[0].rawLine, "1000\t2026-10-03 06:15:00\t0\t1\t0\t0\t0");
});

test("ATTLOG: a malformed line is isolated and the rest survive", () => {
  const body = "1000\t2026-10-03 06:15:00\t0\t1\ngarbage line\n\t2026-10-03 06:16:00\t0\t1\n1001\tnot-a-time\t0\t1\n1003\t2026-10-03 06:18:00\t0\t1";
  const { records, errors } = parseAttlog(body);
  assert.deepEqual(records.map((r) => r.pin), ["1000", "1003"]);
  assert.deepEqual(errors.map((e) => e.reason), ["bad_pin", "bad_pin", "bad_time"]);
});

// ── OPERLOG ─────────────────────────────────────────────────────────────────
test("OPERLOG: FP, USER (both dialects), OPLOG and unknown prefix", () => {
  const body = [
    "FP PIN=1000\tFID=6\tSize=8\tValid=1\tTMP=QUJDRA==",
    "USER PIN=1000\tName=Ravi\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000",
    "USER PIN=1001\tName=Sita\tPrivilege=0",
    "OPLOG 4\t0\t2026-10-03 06:15:00\t0\t0\t0\t0",
    "WEIRD something=1",
  ].join("\r\n");
  const items = parseOperlog(body, "OPERLOG");
  assert.deepEqual(items.map((i) => i.kind), ["FP", "USER", "USER", "OPLOG", "UNKNOWN"]);
  assert.equal(items[0].pin, "1000");
  assert.equal(items[0].fingerIndex, 6);
  assert.equal(items[0].tmp, "QUJDRA==");
  assert.ok(!items[0].rawLine.includes("QUJDRA"), "template redacted from rawLine");
  assert.equal(items[1].dialect, "pri");
  assert.equal(items[1].name, "Ravi");
  assert.equal(items[2].dialect, "privilege");
});

test("OPERLOG: un-prefixed DATA QUERY lines use the table name", () => {
  const items = parseOperlog("PIN=1000\tName=Ravi\tPri=0\nPIN=1001\tName=Sita\tPri=0", "USERINFO");
  assert.deepEqual(items.map((i) => [i.kind, i.pin]), [["USER", "1000"], ["USER", "1001"]]);
  const fps = parseOperlog("PIN=1000\tFID=1\tSize=4\tValid=1\tTMP=AAAA", "FINGERTMP");
  assert.equal(fps[0].kind, "FP");
  assert.equal(fps[0].tmp, "AAAA");
});

// ── BIODATA ─────────────────────────────────────────────────────────────────
test("BIODATA: parse fingerprint and face lines", () => {
  const items = parseOperlog([
    "BIODATA Pin=1000\tNo=3\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=Zm9vYmFy",
    "BIODATA Pin=1000\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=40\tMinorVer=1\tFormat=0\tTmp=ZmFjZQ==",
  ].join("\n"), "BIODATA");
  assert.equal(items[0].kind, "BIODATA");
  assert.equal(items[0].type, 1);
  assert.equal(items[0].fingerIndex, 3);
  assert.equal(items[0].majorVer, 12);
  assert.equal(items[0].tmp, "Zm9vYmFy");
  assert.equal(items[1].type, 9);
  assert.equal(items[1].typeName, "visible_face");
});

test("BIODATA: build is TAB separated and round-trips through the parser", () => {
  const line = buildBiodataUpsert({ pin: 1000, fingerIndex: 3, majorVer: 12, minorVer: 0, tmp: "Zm9vYmFy" });
  assert.equal(line, "DATA UPDATE BIODATA Pin=1000\tNo=3\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=12\tMinorVer=0\tFormat=0\tTmp=Zm9vYmFy");
  const back = parseBiodataFields(line.replace(/^DATA UPDATE BIODATA /, ""));
  assert.equal(back.pin, "1000");
  assert.equal(back.fingerIndex, 3);
  assert.equal(back.tmp, "Zm9vYmFy");
  assert.throws(() => buildBiodataUpsert({ pin: 999, fingerIndex: 0, tmp: "x" }));
  assert.throws(() => buildBiodataUpsert({ pin: 1000, fingerIndex: 0, tmp: "a\tb" }));
});

// ── devicecmd (T4) ──────────────────────────────────────────────────────────
test("devicecmd: single result", () => {
  const { results } = parseDeviceCmd("ID=12&Return=0&CMD=DATA");
  assert.equal(results.length, 1);
  assert.deepEqual([results[0].seq, results[0].returnCode, results[0].cmd], [12, 0, "DATA"]);
});

test("devicecmd: batched results with failures", () => {
  const { results } = parseDeviceCmd("ID=12&Return=0&CMD=DATA\r\nID=13&Return=-1002&CMD=DATA\nID=14&Return=-1004&CMD=DATA\n");
  assert.deepEqual(results.map((r) => [r.seq, r.returnCode]), [[12, 0], [13, -1002], [14, -1004]]);
});

test("devicecmd: INFO with multi-line content, then another result", () => {
  const body = "ID=7&Return=0&CMD=INFO\n~DeviceName=K40/ID\nFWVersion=Ver 6.60 Apr 2 2020\nUserCount=12\n~ZKFPVersion=10\nID=8&Return=0&CMD=DATA";
  const { results } = parseDeviceCmd(body);
  assert.equal(results.length, 2);
  assert.equal(results[0].contentKv.devicename, "K40/ID");
  assert.equal(results[0].contentKv.zkfpversion, "10");
  assert.equal(results[0].contentKv.usercount, "12");
  assert.equal(results[1].seq, 8);
});

test("devicecmd: inline Content= and comma-separated INFO", () => {
  const { results } = parseDeviceCmd("ID=9&Return=0&CMD=INFO&Content=~DeviceName=F22,FPCount=40,~ZKFPVersion=12");
  assert.equal(results[0].contentKv.devicename, "F22");
  assert.equal(results[0].contentKv.fpcount, "40");
  assert.equal(results[0].contentKv.zkfpversion, "12");
});

// ── command builders (§5.6, T2/T3/T14) ──────────────────────────────────────
test("commands: user upsert in both dialects, TAB separated", () => {
  assert.equal(cmd.userUpsert(1000, "Ravi Kumar", "pri"), "DATA UPDATE USERINFO PIN=1000\tName=Ravi Kumar\tPri=0");
  assert.equal(cmd.userUpsert(1000, "Ravi Kumar", "privilege"), "DATA UPDATE USERINFO PIN=1000\tName=Ravi Kumar\tPrivilege=0");
  assert.equal(cmd.userDelete(1000), "DATA DELETE USERINFO PIN=1000");
  assert.equal(cmd.fpUpsert(1000, 6, "QUJD"), "DATA UPDATE FINGERTMP PIN=1000\tFID=6\tSize=4\tValid=1\tTMP=QUJD");
  assert.equal(cmd.info(), "INFO");
  assert.equal(cmd.queryUsers(), "DATA QUERY USERINFO");
});

test("commands: names are sanitised (tab/newline injection, emoji, Telugu, accents, length)", () => {
  const injected = cmd.userUpsert(1000, "Ravi\tPri=14\nC:99:REBOOT", "pri");
  assert.equal(injected.split("\t").length, 3, "no extra fields");
  assert.ok(!/[\r\n]/.test(injected));
  assert.equal(cmd.sanitizeName("Ravi 💪🏽 Kumar"), "Ravi Kumar");
  assert.equal(cmd.sanitizeName("రవి కుమార్", 1000), "Member 1000");
  assert.equal(cmd.sanitizeName("José Müller"), "Jose Muller");
  assert.equal(cmd.sanitizeName("A".repeat(40)).length, 24);
  assert.equal(cmd.sanitizeName("a=b"), "a-b");
});

test("commands: PINs below 1000 are refused (T14)", () => {
  for (const bad of [0, 1, 999, -5, 1000.5, "abc", null]) {
    assert.throws(() => cmd.userUpsert(bad, "x"), String(bad));
    assert.throws(() => cmd.userDelete(bad), String(bad));
  }
  assert.equal(cmd.userDelete("1000"), "DATA DELETE USERINFO PIN=1000");
});

test("commands: enrollment builders", () => {
  assert.equal(cmd.enrollFp(1000, 6), "ENROLL_FP PIN=1000\tFID=6\tRETRY=3\tOVERWRITE=1");
  assert.equal(cmd.enrollBio(1000, 6), "ENROLL_BIO TYPE=1\tPIN=1000\tNO=6\tRETRY=3\tOVERWRITE=1");
  assert.throws(() => cmd.enrollFp(1000, 10));
  assert.throws(() => cmd.enrollBio(5, 1));
});

test("commands: raw and set option reject line breaks", () => {
  assert.equal(cmd.setOption("Delay", 10), "SET OPTION Delay=10");
  assert.throws(() => cmd.setOption("Delay", "1\nREBOOT"));
  assert.throws(() => cmd.raw("INFO\nREBOOT"));
});

// ── handshake (§5.1) ────────────────────────────────────────────────────────
test("handshake: exact default text (snapshot)", () => {
  assert.equal(buildHandshake("CQZ7232260180", { attlogStamp: "9999", operlogStamp: "12" }), [
    "GET OPTION FROM: CQZ7232260180",
    "ATTLOGStamp=9999",
    "OPERLOGStamp=12",
    "ATTPHOTOStamp=0",
    "ErrorDelay=30",
    "Delay=10",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=1111000000",
    "TimeZone=330",
    "Realtime=1",
    "Encrypt=None",
    "ServerVer=2.4.1",
    "PushProtVer=2.4.1",
    "PushOptionsFlag=1",
  ].join("\n"));
});

test("handshake: per-device overrides replace, drop and add keys", () => {
  const text = buildHandshake("SN0001", { handshakeOverrides: { TimeZone: "5.5", Encrypt: null, Delay: 5, MultiBioDataSupport: "0:1:0:0:0:0:0:0:0:0" } });
  assert.match(text, /^TimeZone=5\.5$/m);
  assert.match(text, /^Delay=5$/m);
  assert.doesNotMatch(text, /Encrypt=/);
  assert.match(text, /^MultiBioDataSupport=0:1:0:0:0:0:0:0:0:0$/m);
  assert.match(text, /^ATTLOGStamp=0$/m);
});

test("redaction: template payloads never reach logs", () => {
  assert.equal(redactTemplates("FP PIN=1\tTMP=SECRET\tX=1"), "FP PIN=1\tTMP=<redacted 6b>\tX=1");
  assert.equal(redactTemplates("pin=1\ttemplate=SECRET"), "pin=1\ttemplate=<redacted 6b>");
  assert.equal(redactTemplates("Tmp=abc&ID=1"), "Tmp=<redacted 3b>&ID=1");
});
