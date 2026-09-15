"use strict";
const messages = Object.freeze({
  NO_ROUTE: [409, "No eligible route is available."], INSUFFICIENT_CAPACITY: [409, "Available capacity is insufficient."],
  APPROVAL_PENDING: [403, "Your application is awaiting approval."], MFA_FAILED: [401, "Authenticator verification failed."],
  RECENT_MFA_REQUIRED: [403, "Fresh password and authenticator verification is required."],
  CONFLICT: [409, "The request conflicts with the current account state."],
  INVALID_INPUT: [400, "Invalid request fields."], AUTH_FAILED: [401, "Authentication failed."],
  FORBIDDEN: [403, "Access denied."], CSRF_FAILED: [403, "Request verification failed."],
  REGISTRATION_FAILED: [409, "Registration could not be completed."],
  RATE_LIMITED: [429, "Too many attempts. Try again later."],
  UNAVAILABLE: [503, "Development authentication is unavailable."],
  NOT_FOUND: [404, "Not implemented — payments not connected."],
  BODY_TOO_LARGE: [413, "Request is too large."], METHOD_NOT_ALLOWED: [405, "Method not allowed."]
});
class AuthError extends Error {
  constructor(code) { super(messages[code]?.[1] || messages.UNAVAILABLE[1]); this.code = messages[code] ? code : "UNAVAILABLE"; }
}
function publicError(error) {
  const code = error instanceof AuthError ? error.code : "UNAVAILABLE";
  return { status: messages[code][0], body: { error: code, message: messages[code][1] } };
}
module.exports = { AuthError, publicError };
