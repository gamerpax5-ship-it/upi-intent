"use strict";
const messages = Object.freeze({
  FUNDING_REQUIRED:[409,"Confirmed funding is required before Start."],STATEMENT_REQUIRED:[409,"An accepted statement for this bank version is required before Start."],DEVICE_REQUIRED:[409,"An eligible linked device is required before Start."],
  OTP_SOURCE_UNAVAILABLE:[503,"OTP source unavailable"],
  BELOW_MINIMUM:[409,"Received transfer is below 2000 USDT and remains in review."],UNREPRESENTABLE_AMOUNT:[409,"Exact INR credit cannot represent this token amount; review is required."],EVIDENCE_REVIEW:[409,"Transfer evidence requires independent review."],DUPLICATE_TRANSFER:[409,"Transfer is already attributed to another request."],AMBIGUOUS_TRANSFER:[409,"Transfer attribution is ambiguous and requires review."],
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
