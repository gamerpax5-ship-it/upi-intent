"use strict";

function number(value, min, max) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '') return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : null;
}
function coordinates(device) {
  const latitude = number(device?.latitude, -90, 90), longitude = number(device?.longitude, -180, 180);
  return latitude === null || longitude === null ? null : { latitude, longitude };
}
module.exports = { number, coordinates };
