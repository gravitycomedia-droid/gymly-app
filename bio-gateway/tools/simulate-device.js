#!/usr/bin/env node
"use strict";

// ZKTeco/eSSL device simulator. Speaks plain HTTP to a gateway exactly the
// way TA PUSH 2.x (or AC PUSH 3.x) firmware does, and prints a transcript.
//
//   node tools/simulate-device.js --url http://127.0.0.1:8080 --sn SIMDEV0001
//
// Flags:
//   --url <base>                       gateway base URL (default http://127.0.0.1:8080)
//   --sn <serial>                      device serial (default SIMDEV0001)
//   --proto ta2|ac3                    protocol family (default ta2)
//   --aspx                             use eSSL-style /iclock/*.aspx paths
//   --token <t>                        prefix every path with /d/<t>
//   --template-table FINGERTMP|BIODATA how this device uploads templates
//   --fail-code <n>                    answer every DATA command with Return=<n>
//   --enroll-supported yes|no          answer ENROLL_* with 0 + template, or -1002
//   --polls <n>                        getrequest rounds (default 6)
//   --interval <ms>                    delay between polls (default 2000)
//   --no-replay                        skip the "reboot" re-upload of ATTLOG
//   --quiet                            no transcript (for tests)

const IST_OFFSET_MS = 330 * 60 * 1000;

function parseArgs(argv) {
  const o = {
    url: "http://127.0.0.1:8080", sn: "SIMDEV0001", proto: "ta2", aspx: false, token: null,
    templateTable: "FINGERTMP", failCode: null, enrollSupported: "yes", polls: 6, interval: 2000,
    replay: true, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--url") o.url = next();
    else if (a === "--sn") o.sn = next();
    else if (a === "--proto") o.proto = next();
    else if (a === "--aspx") o.aspx = true;
    else if (a === "--token") o.token = next();
    else if (a === "--template-table") o.templateTable = next().toUpperCase();
    else if (a === "--fail-code") o.failCode = Number(next());
    else if (a === "--enroll-supported") o.enrollSupported = next();
    else if (a === "--polls") o.polls = Number(next());
    else if (a === "--interval") o.interval = Number(next());
    else if (a === "--no-replay") o.replay = false;
    else if (a === "--quiet") o.quiet = true;
  }
  return o;
}

function istWallClock(ms) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeTemplate = (pin, finger) => Buffer.from(`zk-fake-template-${pin}-${finger}-`.repeat(8)).toString("base64");

function show(text, max = 400) {
  const s = String(text).replace(/(TMP|Tmp|template)=([^\t\r\n&]*)/g, (_, k, v) => `${k}=<${v.length}b>`);
  const vis = s.replace(/\t/g, "⇥").replace(/\r/g, "␍");
  return vis.length > max ? vis.slice(0, max) + "…" : vis;
}

async function simulate(opts) {
  const o = { ...parseArgs([]), ...opts };
  const transcript = [];
  const out = (line) => { transcript.push(line); if (!o.quiet) console.log(line); };
  const path = (ep) => `${o.token ? `/d/${o.token}` : ""}/iclock/${ep}${o.aspx ? ".aspx" : ""}`;

  async function call(method, ep, query, body) {
    const qs = new URLSearchParams({ SN: o.sn, ...query }).toString();
    const p = `${path(ep)}?${qs}`;
    out(`→ ${method} ${p}${body ? `\n    ${show(body).split("\n").join("\n    ")}` : ""}`);
    const r = await fetch(o.url + p, { method, body, redirect: "manual", headers: body ? { "Content-Type": "text/plain" } : {} });
    const text = await r.text();
    out(`← ${r.status} [${r.headers.get("content-type")}] ${show(text).split("\n").join("\n    ")}`);
    return { status: r.status, text };
  }

  const pendingUploads = [];

  async function pollOnce() {
    const r = await call("GET", "getrequest", {});
    if (r.text === "OK" || r.status !== 200) return 0;
    const cmds = r.text.split("\n").filter(Boolean).map((l) => {
      const m = /^C:(\d+):(.*)$/.exec(l);
      return m ? { id: m[1], cmd: m[2] } : null;
    }).filter(Boolean);
    const results = [];
    for (const c of cmds) {
      if (c.cmd === "INFO") {
        results.push(`ID=${c.id}&Return=0&CMD=INFO\n~DeviceName=K40/ID\nFWVersion=Ver 6.60 Apr 2 2020\nUserCount=2\nFPCount=0\nTransactionCount=5\n~ZKFPVersion=10\nPushVersion=${o.templateTable === "BIODATA" ? "2.4.1" : "2.2.14"}`);
      } else if (/^ENROLL_(FP|BIO) /.test(c.cmd)) {
        const pin = /PIN=(\d+)/.exec(c.cmd)[1];
        const finger = Number((/(?:FID|NO)=(\d+)/.exec(c.cmd) || [])[1] || 0);
        if (o.enrollSupported === "yes") {
          results.push(`ID=${c.id}&Return=0&CMD=${c.cmd.split(" ")[0]}`);
          pendingUploads.push({ pin, finger });
        } else {
          results.push(`ID=${c.id}&Return=-1002&CMD=${c.cmd.split(" ")[0]}`);
        }
      } else {
        const code = o.failCode != null && c.cmd.startsWith("DATA ") ? o.failCode : 0;
        results.push(`ID=${c.id}&Return=${code}&CMD=${c.cmd.split(" ")[0]}`);
      }
    }
    // Batched acks (T4).
    await call("POST", "devicecmd", {}, results.join("\n"));
    // A remote enrollment finishes: the device uploads the new template.
    for (const u of pendingUploads.splice(0)) await uploadTemplate(u.pin, u.finger);
    return cmds.length;
  }

  async function uploadTemplate(pin, finger) {
    const tmp = fakeTemplate(pin, finger);
    if (o.templateTable === "BIODATA") {
      await call("POST", "cdata", { table: "BIODATA", Stamp: "1" },
        `BIODATA Pin=${pin}\tNo=${finger}\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${tmp}`);
    } else {
      await call("POST", "cdata", { table: "OPERLOG", Stamp: "2" },
        `FP PIN=${pin}\tFID=${finger}\tSize=${tmp.length}\tValid=1\tTMP=${tmp}\nOPLOG 6\t0\t${istWallClock(Date.now())}\t${pin}\t${finger}\t0\t0`);
    }
  }

  if (o.proto === "ac3") {
    out("── AC PUSH 3.x (scaffold) ──");
    await call("POST", "registry", {}, "DeviceType=acc,~DeviceName=SpeedFace-V5L,FirmVer=ZAM180-NF,PushVersion=3.1.2,~ZKFPVersion=12");
    await call("GET", "push", {});
    const t = Date.now() - 60000;
    await call("POST", "cdata", { table: "rtlog" },
      [`time=${istWallClock(t)}\tpin=1001\tcardno=0\teventaddr=1\tevent=0\tinoutstatus=0\tverifytype=1\tindex=1`,
        `time=${istWallClock(t + 1000)}\tpin=0\tcardno=0\teventaddr=1\tevent=27\tinoutstatus=0\tverifytype=200\tindex=2`].join("\r\n"));
    for (let i = 0; i < o.polls; i++) { await pollOnce(); await sleep(o.interval); }
    return transcript;
  }

  out("── 1. boot handshake ──");
  await call("GET", "cdata", { options: "all", pushver: o.templateTable === "BIODATA" ? "2.4.1" : "2.2.14", language: "69" });
  await call("POST", "cdata", { table: "options" },
    `~DeviceName=K40/ID,MAC=00:17:61:12:34:56,TransactionCount=5,~MaxAttLogCount=10,UserCount=0,FPCount=0,~ZKFPVersion=10,FWVersion=Ver 6.60 Apr 2 2020,PushVersion=${o.templateTable === "BIODATA" ? "2.4.1" : "2.2.14"}`);

  out("── 2. command loop (users, INFO, remote enrollment) ──");
  for (let i = 0; i < o.polls; i++) {
    await pollOnce();
    if (i < o.polls - 1) await sleep(o.interval);
  }

  out("── 3. punches: 3 valid, 1 malformed, 1 duplicate, 1 re-punch inside 90 min, unknown PIN, local admin PIN; mixed \\r\\n / \\n ──");
  const base = Date.now() - 10 * 60000;
  const l1 = `1000\t${istWallClock(base)}\t0\t1\t0\t0\t0`;
  const attlog = [
    l1,
    `1001\t${istWallClock(base + 60000)}\t0\t1\t0\t0\t0`,
    "this line is garbage",
    l1, // duplicate inside the same batch
    `1000\t${istWallClock(base + 120000)}\t0\t1\t0\t0\t0`, // already inside → no 2nd session
    `4321\t${istWallClock(base + 180000)}\t0\t1\t0\t0\t0`, // unknown PIN
    `1\t${istWallClock(base + 240000)}\t0\t1\t0\t0\t0`, // on-device admin (T14)
  ];
  const attlogBody = attlog.slice(0, 3).join("\r\n") + "\n" + attlog.slice(3).join("\r\n") + "\r\n";
  await call("POST", "cdata", { table: "ATTLOG", Stamp: "100" }, attlogBody);

  out("── 4. user roster upload (dialect detection) ──");
  await call("POST", "cdata", { table: "OPERLOG", Stamp: "3" },
    "USER PIN=1000\tName=Ravi Kumar\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\nUSER PIN=1\tName=Admin\tPri=14");

  if (o.replay) {
    out("── 5. reboot: device re-uploads the same ATTLOG (T11) ──");
    await call("GET", "cdata", { options: "all", pushver: "2.2.14" });
    await call("POST", "cdata", { table: "ATTLOG", Stamp: "100" }, attlogBody);
  }

  out("── 6. drain remaining commands ──");
  await pollOnce();
  return transcript;
}

module.exports = { simulate, parseArgs };

if (require.main === module) {
  simulate(parseArgs(process.argv.slice(2))).catch((e) => {
    console.error("simulator error:", e.message);
    process.exit(1);
  });
}
