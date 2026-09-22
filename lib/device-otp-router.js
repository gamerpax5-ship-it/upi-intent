const express = require("express");

// Existing database tables/data are left unchanged.
async function initDeviceOtpTables(_pool) {}

function createDeviceOtpRouter(_options = {}) {
  const router = express.Router();

  // Reject OTP uploads, including requests from older APKs.
  router.post("/otp-event", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(410).json({
      error: "OTP uploads are disabled"
    });
  });

  // Stop the old dashboard from returning stored OTP events.
  router.get("/admin/device/:deviceId/otp-events", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(410).json({
      error: "OTP access is disabled"
    });
  });

  return router;
}

module.exports = {
  initDeviceOtpTables,
  createDeviceOtpRouter
};
