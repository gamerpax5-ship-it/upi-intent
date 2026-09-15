"use strict";
const { StringDecoder } = require("node:string_decoder");
function readSecret(prompt, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== "function") return Promise.reject(new Error("A local interactive terminal is required."));
  return new Promise((resolve, reject) => {
    let value = "";
    const decoder = new StringDecoder("utf8");
    const priorRaw = !!input.isRaw;
    function finish(error) {
      input.removeListener("data", onData); input.removeListener("error", onError);
      input.setRawMode(priorRaw); input.pause(); output.write("\n");
      const result = value; value = "";
      if (error) reject(new Error("Secret input cancelled or too long.")); else resolve(result);
    }
    function onError() { finish(true); }
    function onData(bytes) {
      for (const char of decoder.write(bytes)) {
        if (char === "\u0003" || char === "\u0004" || char === "\u001b") return finish(true);
        if (char === "\r" || char === "\n") return finish(false);
        if (char === "\u007f" || char === "\b") value = [...value].slice(0, -1).join("");
        else value += char;
        if (Buffer.byteLength(value, "utf8") > 512) return finish(true);
      }
    }
    output.write(prompt); input.setRawMode(true); input.resume(); input.on("data", onData); input.once("error", onError);
  });
}
module.exports = { readSecret };
