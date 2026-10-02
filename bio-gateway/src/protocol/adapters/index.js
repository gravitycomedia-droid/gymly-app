"use strict";

const ta2 = require("./ta2");
const ac3 = require("./ac3");

function adapterFor(caps) {
  return caps && caps.protocol === "ac3" ? ac3 : ta2;
}

module.exports = { adapterFor, ta2, ac3 };
