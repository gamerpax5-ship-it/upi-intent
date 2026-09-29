package org.wtron.wpayagent

internal object LocationRefreshPolicy {
    fun useCached(ageMillis: Long, forceFresh: Boolean): Boolean =
        !forceFresh && ageMillis in 0..30_000

    fun diagnosticsDue(online: Boolean, wasOnline: Boolean, elapsedMillis: Long): Boolean =
        online && (!wasOnline || elapsedMillis >= 120_000)
}
