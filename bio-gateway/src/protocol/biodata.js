"use strict";

// BIODATA (TA PUSH ≥ 2.4.0 "unified template" table):
//   BIODATA Pin=1000\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=<base64>
// No = finger number (0-9), Index = template index within that finger.
// v1 stores and pushes Type=1 (fingerprint) only; everything else is logged
// as unsupported_type and skipped without failing the upload.

const { parseKv, toInt } = require("./kv");
const { assertPin } = require("./commands");

const BIO_TYPES = {
  0: "general", 1: "fingerprint", 2: "face", 3: "voiceprint", 4: "iris",
  5: "retina", 6: "palmprint", 7: "finger_vein", 8: "palm", 9: "visible_face",
};
const FINGERPRINT = 1;

function parseBiodataFields(text) {
  const kv = parseKv(text);
  const type = toInt(kv.type);
  return {
    pin: kv.pin != null ? String(kv.pin).trim() : null,
    fingerIndex: toInt(kv.no, 0),
    subIndex: toInt(kv.index, 0),
    valid: toInt(kv.valid, 1),
    duress: toInt(kv.duress, 0),
    type,
    typeName: BIO_TYPES[type] || `type_${type}`,
    majorVer: toInt(kv.majorver),
    minorVer: toInt(kv.minorver),
    format: toInt(kv.format, 0),
    tmp: kv.tmp || "",
  };
}

function buildBiodataUpsert({ pin, fingerIndex, subIndex = 0, majorVer, minorVer, tmp }) {
  assertPin(pin);
  if (!Number.isInteger(fingerIndex) || fingerIndex < 0 || fingerIndex > 9) {
    throw new Error("fingerIndex must be 0-9");
  }
  if (!tmp || /[\t\r\n]/.test(tmp)) throw new Error("bad template payload");
  return [
    `DATA UPDATE BIODATA Pin=${pin}`,
    `No=${fingerIndex}`,
    `Index=${subIndex}`,
    "Valid=1",
    "Duress=0",
    `Type=${FINGERPRINT}`,
    `MajorVer=${majorVer == null ? "" : majorVer}`,
    `MinorVer=${minorVer == null ? "" : minorVer}`,
    "Format=0",
    `Tmp=${tmp}`,
  ].join("\t");
}

module.exports = { BIO_TYPES, FINGERPRINT, parseBiodataFields, buildBiodataUpsert };
