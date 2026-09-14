package org.wtron.wpayagent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class OtpDetectorTest {
    @Test
    fun detectsNaviStyleOtp() {
        val result = OtpDetector.detect("703007 is your Navi login OTP. Do not share with anyone.")
        assertNotNull(result)
        assertEquals("703007", result!!.code)
        assertEquals(6, result.otpLength)
    }

    @Test
    fun detectsIobTransferOtp() {
        val result = OtpDetector.detect("Dear Customer,991499 is OTP to approve IMPS Fund trf of Rs.11.00 from A/c ending 05057 to Vishvajeet. Do not share OTP to any one-IOB")
        assertNotNull(result)
        assertEquals(6, result!!.otpLength)
    }

    @Test
    fun detectsOneTimePasswordStyle() {
        val result = OtpDetector.detect("Dear Customer, 291653 is One Time Password(OTP) for the request.")
        assertNotNull(result)
        assertEquals(6, result!!.otpLength)
    }

    @Test
    fun detectsOtpAfterLabelAndKeepsLength() {
        val result = OtpDetector.detect("Your verification code is 84726190. Valid for 5 minutes.")
        assertNotNull(result)
        assertEquals(8, result!!.otpLength)
    }

    @Test
    fun detectsOtpWithPhraseBetweenLabelAndIs() {
        val result = OtpDetector.detect("Dear User, your OTP for login is 558822. Do not share.")
        assertNotNull(result)
        assertEquals("558822", result!!.code)
        assertEquals(6, result.otpLength)
    }

    @Test
    fun detectsOtpWithAmountPhraseBeforeIs() {
        val result = OtpDetector.detect("Your OTP for the transaction of Rs.500 is 445566.")
        assertNotNull(result)
        assertEquals("445566", result!!.code)
    }

    @Test
    fun detectsFourDigitOtp() {
        val result = OtpDetector.detect("OTP: 8642 for login")
        assertNotNull(result)
        assertEquals(4, result!!.otpLength)
    }

    @Test
    fun detectsUseOtpStyle() {
        val result = OtpDetector.detect("Use 735921 as your OTP.")
        assertNotNull(result)
        assertEquals(6, result!!.otpLength)
    }

    @Test
    fun detectsEnterVerificationCodeStyle() {
        val result = OtpDetector.detect("Enter 483920 for verification code.")
        assertNotNull(result)
        assertEquals(6, result!!.otpLength)
    }

    @Test
    fun detectedCodeIsReturnedUnmaskedForUpload() {
        val body = "Dear Customer,991499 is OTP to approve IMPS Fund trf of Rs.11.00. Do not share OTP."
        val detected = OtpDetector.detect(body)
        assertNotNull(detected)
        assertEquals("991499", detected!!.code)
        assertEquals(6, detected.otpLength)
    }

    @Test
    fun currencyAmountsAreNotTreatedAsOtp() {
        assertNull(OtpDetector.detect("Rs.5000 is debited from your account and OTP is required to complete this transaction."))
        assertNull(OtpDetector.detect("INR 15000 is debited from your account. OTP is required to authorise."))
        assertNull(OtpDetector.detect("Payment of \u20B97500 for transaction declined. Do not share OTP."))
        assertNull(OtpDetector.detect("Rs.5000 for transaction declined. Do not share OTP."))
    }

    @Test
    fun referenceNumbersAreNotTreatedAsOtp() {
        assertNull(OtpDetector.detect("I have paid 5000 for transaction at Amazon"))
        assertNull(OtpDetector.detect("IMPS Ref 887766 for transaction completed successfully."))
    }

    @Test
    fun sentenceCrossingAfterOtpLabelIsNotOtp() {
        assertNull(OtpDetector.detect("Your OTP is required. 5000 is deducted from your account."))
        assertNull(OtpDetector.detect("OTP is required to complete this transaction. 5000 is debited from account."))
        assertNull(OtpDetector.detect("Do not share your OTP. 5000 is debited from your account."))
        assertNull(OtpDetector.detect("OTP sent for login. 5000 is the amount debited."))
    }

    @Test
    fun realOtpAfterCurrencyContextIsStillDetected() {
        val result = OtpDetector.detect("Payment of Rs. 25000.00 to merchant@upi. Use OTP 445566 to confirm.")
        assertNotNull(result)
        assertEquals("445566", result!!.code)
    }

    @Test
    fun doesNotTreatOrdinaryBankNumbersAsOtp() {
        assertNull(OtpDetector.detect("A/c XX8852 credited by Rs. 15.00 via UPI Ref No. 611611827740."))
        assertNull(OtpDetector.detect("Contact Helpdesk 044-28519460.IOB."))
        assertNull(OtpDetector.detect("You have done a Transaction on 26-07-2026 for Rs.11.00."))
    }

    @Test
    fun blankMessageIsNotOtp() {
        assertNull(OtpDetector.detect(""))
        assertNull(OtpDetector.detect("   "))
    }
}
