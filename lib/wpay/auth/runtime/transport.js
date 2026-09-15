"use strict";
const { AuthError } = require("./errors");
const DEVELOPMENT = Object.freeze({
  secure: false, bind: "127.0.0.1", path: "/wpay-auth/",
  session: "wpay_auth_dev_session", csrf: "wpay_auth_dev_csrf", challenge: "wpay_auth_dev_challenge"
});
function transport(origin) {
  if (origin === undefined) return DEVELOPMENT;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password ||
        !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname) || !url.hostname.includes(".") ||
        url.port || url.hostname === "healthcheck.railway.app") throw 0;
    return Object.freeze({ secure: true, bind: "0.0.0.0", path: "/", origin, host: url.host,
      session: "__Host-wpay_session", csrf: "__Host-wpay_csrf", challenge: "__Host-wpay_challenge" });
  } catch { throw new AuthError("UNAVAILABLE"); }
}
module.exports = { transport, DEVELOPMENT };
