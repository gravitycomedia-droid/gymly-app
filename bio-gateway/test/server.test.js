"use strict";

// HTTP contract tests with an in-memory fake store (no Firestore needed).
// Every /iclock/* response must be text/plain with `OK`, the handshake/config
// text or a command list (T1), never JSON/HTML/redirects.

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/server");

process.env.BIO_GATEWAY_SILENT = "1";

function fakeEnv({ devices = {}, commands = [], failWrites = false } = {}) {
  const calls = [];
  const devMap = new Map(Object.entries(devices).map(([sn, d]) => [sn, { sn, ...d }]));
  const caches = {
    devices: devMap,
    commandsForSn: (sn) => commands.filter((c) => c.sn === sn),
    enrollmentsForGym: () => new Map(),
    patchDevice() {},
    patchCommand() {},
  };
  const rec = (name) => async (...args) => {
    calls.push([name, ...args]);
    if (failWrites && ["writePunches", "storeTemplates", "applyAcks", "markSent"].includes(name)) {
      throw new Error("firestore unavailable");
    }
    if (name === "writePunches") return { sessions: 1, logs: 1, unmatched: 0, duplicates: 0, skippedInside: 0 };
    if (name === "applyAcks") return { acked: 1, failed: 0, unknown: 0 };
    if (name === "storeTemplates") return { stored: 1 };
    return undefined;
  };
  const store = {
    updateDevice: rec("updateDevice"),
    updateCaps: rec("updateCaps"),
    touchDevice: rec("touchDevice"),
    activateDevice: async (device, opts) => {
      calls.push(["activateDevice", device.sn, opts]);
      device.status = "active";
    },
    writeRawLog: rec("writeRawLog"),
    writePunches: rec("writePunches"),
    storeTemplates: rec("storeTemplates"),
    applyAcks: rec("applyAcks"),
    markSent: rec("markSent"),
    expireCommands: rec("expireCommands"),
    selectCommands: (sn) => ({ deliver: caches.commandsForSn(sn).filter((c) => c.status === "pending"), expire: [] }),
  };
  return { caches, store, calls };
}

async function withServer(env, fn, opts = {}) {
  const app = createApp({ db: { doc: () => ({ get: async () => ({}) }) }, ...env, ...opts });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function req(base, path, { method = "GET", body } = {}) {
  const r = await fetch(base + path, { method, body, redirect: "manual" });
  return { status: r.status, type: r.headers.get("content-type"), text: await r.text() };
}

const ACTIVE = { status: "active", gym_id: "G1", caps: { protocol: "ta2" } };

test("handshake: active device gets the config text; unknown SN still gets it (keeps looping)", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    const a = await req(base, "/iclock/cdata?SN=SN0001&options=all&pushver=2.4.1");
    assert.equal(a.status, 200);
    assert.match(a.type, /^text\/plain/);
    assert.match(a.text, /^GET OPTION FROM: SN0001\n/);
    assert.match(a.text, /TimeZone=330/);
    const u = await req(base, "/iclock/cdata?SN=UNKNOWN99&options=all");
    assert.equal(u.status, 200);
    assert.match(u.text, /^GET OPTION FROM: UNKNOWN99/);
  });
  assert.ok(env.calls.some((c) => c[0] === "writeRawLog" && c[1].note === "unknown_sn"));
});

test(".aspx suffix and /d/{token} prefix route to the same handlers", async () => {
  const env = fakeEnv({ devices: { SN0001: { ...ACTIVE, deviceToken: "tok123" } } });
  await withServer(env, async (base) => {
    for (const p of [
      "/iclock/cdata.aspx?SN=SN0001&options=all",
      "/d/tok123/iclock/cdata?SN=SN0001&options=all",
      "/d/tok123/iclock/cdata.aspx?SN=SN0001&options=all",
    ]) {
      const r = await req(base, p);
      assert.equal(r.status, 200, p);
      assert.match(r.text, /^GET OPTION FROM: SN0001/, p);
    }
    const bad = await req(base, "/d/wrong/iclock/cdata?SN=SN0001&options=all");
    assert.equal(bad.status, 401);
    assert.match(bad.type, /^text\/plain/);
  });
});

test("pending claim inside its window is activated on first contact", async () => {
  const future = { toMillis: () => Date.now() + 60000 };
  const env = fakeEnv({ devices: { SN0002: { status: "pending_claim", gym_id: "G1", claimExpiresAt: future } } });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/getrequest?SN=SN0002");
    assert.equal(r.text, "OK");
  });
  assert.ok(env.calls.some((c) => c[0] === "activateDevice"));
});

test("expired claim is treated as unknown: uploads get 503 (device keeps data)", async () => {
  const past = { toMillis: () => Date.now() - 1 };
  const env = fakeEnv({ devices: { SN0003: { status: "pending_claim", gym_id: "G1", claimExpiresAt: past } } });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/cdata?SN=SN0003&table=ATTLOG&Stamp=1", { method: "POST", body: "1000\t2026-10-03 06:15:00\t0\t1" });
    assert.equal(r.status, 503);
    assert.match(r.type, /^text\/plain/);
  });
  assert.ok(!env.calls.some((c) => c[0] === "activateDevice"));
  assert.ok(!env.calls.some((c) => c[0] === "writePunches"));
});

test("ATTLOG upload: OK only after the write; Firestore failure → 500", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/cdata?SN=SN0001&table=ATTLOG&Stamp=42", { method: "POST", body: "1000\t2026-10-03 06:15:00\t0\t1\nbroken\n" });
    assert.equal(r.status, 200);
    assert.equal(r.text, "OK");
  });
  const wp = env.calls.find((c) => c[0] === "writePunches");
  assert.equal(wp[2].length, 1, "malformed line isolated");
  assert.ok(env.calls.some((c) => c[0] === "updateDevice" && c[2].attlogStamp === "42"));

  const failing = fakeEnv({ devices: { SN0001: ACTIVE }, failWrites: true });
  await withServer(failing, async (base) => {
    const r = await req(base, "/iclock/cdata?SN=SN0001&table=ATTLOG&Stamp=43", { method: "POST", body: "1000\t2026-10-03 06:15:00\t0\t1" });
    assert.equal(r.status, 500);
    assert.match(r.type, /^text\/plain/);
  });
  assert.ok(!failing.calls.some((c) => c[0] === "updateDevice" && c[2].attlogStamp), "stamp not advanced on failure");
});

test("getrequest: commands formatted C:<seq>:<cmd> in seq order; nothing pending → OK", async () => {
  const commands = [
    { id: "SN0001_5", sn: "SN0001", seq: 5, status: "pending", cmd: "DATA UPDATE USERINFO PIN=1000\tName=Ravi\tPri=0" },
    { id: "SN0001_6", sn: "SN0001", seq: 6, status: "pending", cmd: "INFO" },
  ];
  const env = fakeEnv({ devices: { SN0001: ACTIVE, SN0004: ACTIVE }, commands });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/getrequest.aspx?SN=SN0001");
    assert.equal(r.text, "C:5:DATA UPDATE USERINFO PIN=1000\tName=Ravi\tPri=0\nC:6:INFO\n");
    assert.match(r.type, /^text\/plain/);
    const empty = await req(base, "/iclock/getrequest?SN=SN0004");
    assert.equal(empty.text, "OK");
  });
  assert.ok(env.calls.some((c) => c[0] === "markSent"));
});

test("getrequest: if marking sent fails, no commands are handed out", async () => {
  const commands = [{ id: "SN0001_1", sn: "SN0001", seq: 1, status: "pending", cmd: "INFO" }];
  const env = fakeEnv({ devices: { SN0001: ACTIVE }, commands, failWrites: true });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/getrequest?SN=SN0001");
    assert.equal(r.text, "OK");
  });
});

test("devicecmd: batched acks → OK", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/devicecmd?SN=SN0001", { method: "POST", body: "ID=5&Return=0&CMD=DATA\nID=6&Return=-1002&CMD=DATA" });
    assert.equal(r.text, "OK");
  });
  const acks = env.calls.find((c) => c[0] === "applyAcks");
  assert.equal(acks[2].length, 2);
});

test("unknown /iclock paths, bad SNs and ping all answer OK", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    for (const p of ["/iclock/ping?SN=SN0001", "/iclock/fdata?SN=SN0001", "/iclock/test?SN=SN0001",
      "/iclock/cdata?SN=bad!sn&options=all", "/iclock/cdata?options=all", "/iclock/a/b/c", "/d/x/y"]) {
      const r = await req(base, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.text, "OK", p);
      assert.match(r.type, /^text\/plain/, p);
    }
  });
});

test("oversized body is logged and acked OK (never wedge the device)", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    const big = "1000\t2026-10-03 06:15:00\t0\t1\n".repeat(400000); // ~12 MB
    const r = await req(base, "/iclock/cdata?SN=SN0001&table=ATTLOG&Stamp=1", { method: "POST", body: big });
    assert.equal(r.status, 200);
    assert.equal(r.text, "OK");
  });
  assert.ok(!env.calls.some((c) => c[0] === "writePunches"));
});

test("rate limit: over the limit → 503 text/plain, never HTML", async () => {
  const env = fakeEnv({ devices: { SN0001: ACTIVE } });
  await withServer(env, async (base) => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await req(base, "/iclock/ping?SN=SN0001")).status);
    assert.deepEqual(statuses, [200, 200, 200, 503, 503]);
    const r = await req(base, "/iclock/ping?SN=SN0001");
    assert.match(r.type, /^text\/plain/);
  }, { rateLimit: { limit: 3, windowMs: 60000 } });
});

test("AC 3.x registry and push answer with plain-text config", async () => {
  const env = fakeEnv({ devices: { SN0005: { ...ACTIVE, registryCode: "rc1" } } });
  await withServer(env, async (base) => {
    const r = await req(base, "/iclock/registry?SN=SN0005", { method: "POST", body: "DeviceType=acc,~DeviceName=SpeedFace-V5L,PushVersion=3.1.2" });
    assert.equal(r.text, "RegistryCode=rc1");
    const p = await req(base, "/iclock/push?SN=SN0005");
    assert.match(p.text, /SessionID=rc1/);
    assert.match(p.type, /^text\/plain/);
  });
});

test("non-device paths get a plain 404, not HTML", async () => {
  const env = fakeEnv();
  await withServer(env, async (base) => {
    const r = await req(base, "/");
    assert.equal(r.status, 404);
    assert.match(r.type, /^text\/plain/);
  });
});
