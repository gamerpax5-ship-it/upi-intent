package org.wtron.wpayagent

object OtpDetector {
    data class DetectedOtp(
        val code: String,
        val otpLength: Int
    )

    private val otpLabel =
        "(?:OTP|one[\\s-]*time\\s+password|verification\\s+code|security\\s+code|passcode|auth\\s*(?:otp)?|login\\s+code)"

    private val patterns = listOf(
        // Pattern 1: "123456 is your OTP" / "123456 is your verification code"
        Regex(
            "(?i)\\b([0-9]{4,8})\\b\\s+is\\s+(?:your\\s+)?" +
                "(?:[A-Za-z][A-Za-z0-9._-]*\\s+){0,2}$otpLabel\\b"
        ),
        // Pattern 2: "OTP: 123456" / "Verification code = 123456" / "OTP-123456"
        Regex(
            "(?i)\\b$otpLabel\\b(?:\\s*\\([^)]*\\))?" +
                "\\s*(?:is|:|=|-)?\\s*([0-9]{4,8})\\b"
        ),
        // Pattern 2b: "Your OTP for login is 123456" — label followed by a short phrase, then "is", then the code.
        // Phrase tokens may embed an amount like "Rs.500", but a "." must be followed by digits, so the
        // phrase cannot cross a sentence boundary ("OTP is required. 5000 is debited" stays undetected).
        Regex(
            "(?i)\\b$otpLabel\\b(?:\\s*\\([^)]*\\))?" +
                "\\s+(?:[A-Za-z][A-Za-z0-9]*(?:\\.\\d+)?\\s+){0,5}is\\s+([0-9]{4,8})\\b"
        ),
        // Pattern 3: "Use 123456 as OTP" / "Enter 123456 for verification code"
        Regex(
            "(?i)\\b(?:use|enter|please\\s+enter|please\\s+use)\\s+([0-9]{4,8})" +
                "\\s+(?:as|for)\\s+(?:your\\s+)?$otpLabel\\b"
        ),
        // Pattern 4: "Your code is 123456" (generic code pattern without explicit OTP label)
        Regex(
            "(?i)\\byour\\s+(?:access\\s+)?code\\s+is\\s+([0-9]{4,8})\\b"
        ),
        // Pattern 5: "Code: 123456" / "Code = 123456" (standalone code references)
        Regex(
            "(?i)\\bcode\\s*(?:is|:|=|-)\\s*([0-9]{4,8})\\b"
        ),
        // Pattern 6: "123456 for authentication" / "123456 to confirm"
        Regex(
            "\\b([0-9]{4,8})\\b\\s+(?:for|to)\\s+(?:your\\s+)?(?:authentication|authorization|login|confirm|verify|access|approval|transaction)\\b"
        ),
        // Pattern 7: Colon-separated with whitespace variations "OTP: 123456" or "OTP:123456"
        Regex(
            "(?i)(?:otp|verification|security|auth|passcode|pin)\\s*:\\s*([0-9]{4,8})\\b"
        )
    )

    /**
     * Rejects candidates that are really currency amounts (Rs./INR/USD/EUR/₹/$) or reference numbers
     * (Ref/RRN/UTR/Txn/Paid/A-c) rather than OTP codes, e.g. "Rs.5000 is debited ... and OTP is required"
     * or "IMPS Ref 887766 for transaction" must not report those numbers as the OTP.
     */
    private val currencyPrefix =
        Regex("(?i)(?<![a-z])(?:rs|inr|usd|eur|ref|rrn|utr|txn|paid|a/c)\\.?\\s*\\z|[\\u20B9\\u0024]\\s*\\z")

    fun detect(body: String): DetectedOtp? = null

    private fun isCurrencyAmount(body: String, digitStart: Int): Boolean {
        val from = (digitStart - 12).coerceAtLeast(0)
        if (from >= digitStart) return false
        return currencyPrefix.containsMatchIn(body.substring(from, digitStart))
    }
}
