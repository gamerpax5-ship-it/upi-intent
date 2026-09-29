package org.wtron.wpayagent

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocationRefreshPolicyTest {
    @Test fun reconnectRequestsFreshLocation() {
        assertFalse(LocationRefreshPolicy.useCached(1_000, true))
        assertTrue(LocationRefreshPolicy.diagnosticsDue(true, false, 1_000))
    }
    @Test fun futureAndOldCachedFixesAreNotCurrent() {
        assertFalse(LocationRefreshPolicy.useCached(-1, false))
        assertFalse(LocationRefreshPolicy.useCached(30_001, false))
        assertTrue(LocationRefreshPolicy.useCached(30_000, false))
    }
    @Test fun steadyConnectionIsBoundedAndOfflineDoesNotUpload() {
        assertFalse(LocationRefreshPolicy.diagnosticsDue(false, true, 300_000))
        assertFalse(LocationRefreshPolicy.diagnosticsDue(true, true, 119_999))
        assertTrue(LocationRefreshPolicy.diagnosticsDue(true, true, 120_000))
    }
}
