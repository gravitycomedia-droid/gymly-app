"use strict";

// Structured JSON logs to stdout (journald on the VM). Template payloads are
// redacted before anything is printed (T17).

const { redactTemplates } = require("./protocol/kv");

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[process.env.LOG_LEVEL || "info"] || LEVELS.info;

function safe(value) {
  if (typeof value === "string") return redactTemplates(value);
  if (value instanceof Error) return { message: redactTemplates(value.message), code: value.code };
  return value;
}

function log(level, msg, fields = {}) {
  if ((LEVELS[level] || 0) < MIN || process.env.BIO_GATEWAY_SILENT === "1") return;
  const out = { t: new Date().toISOString(), level, msg };
  for (const [k, v] of Object.entries(fields)) out[k] = safe(v);
  process.stdout.write(JSON.stringify(out) + "\n");
}

module.exports = {
  debug: (m, f) => log("debug", m, f),
  info: (m, f) => log("info", m, f),
  warn: (m, f) => log("warn", m, f),
  error: (m, f) => log("error", m, f),
};
