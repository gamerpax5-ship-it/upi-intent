# Explicitly approved protection baseline review

User approved commit `3d65c3257cd3c4b8a5abe77b5c113984930487b0` as the reviewed baseline after disclosure of all substantive changes. This is a one-time update, not authorization for automatic future repinning.

All 197 protected paths remain unchanged as a set. Independent comparison of Git blobs against the original `8162d1dd81e8e8f20b8dfcc7dcc919fdf168d541` found 193 byte-identical files and four substantive changes already published/approved:

| Path | Reviewed SHA-256 |
| --- | --- |
| lib/device-otp-router.js | 2ab9008a74c78e08fbeddfde636762415b6c85e3229e10dd126ad9ca44829779 |
| test/device-otp-router.test.js | 26b065df92dfa9ec24bd3af6890a05ce3ae19e188b4171daabc32ac0ed94b6d7 |
| public/downloads/WPAY-Agent.apk | daea8fed6263bb61a3a35cb4c4cfd10ead6cd6c5d6a1886f8bba79f1c960a807 |
| public/downloads/WPAY-Agent.json | f78086c8cc5e7d9f05d00e60811f5dcfa44212ce2a828a620f0b540f2ea430e1 |

The OTP changes mask persisted values; the binary and metadata are signed APK build.23, released by workflow 36613908302. No protected logic was changed for this baseline review.

New manifest SHA-256: `7b2a9d94fe5a48abb5fd42c6464ab7ca1e74fe4b723ee91c9fa9869e97bc328a`.

Per-path `-text` attributes preserve the reviewed Git blob bytes, rather than platform-dependent checkout conversions. 174 local files differed only by CRLF/LF conversion and were restored mechanically to those exact reviewed bytes after rejecting any substantive working-copy difference. Migration SQL remains separately pinned to LF to match database checksums. No schema, RLS, grants, stored checksums or financial records changed.

Only baseline/digest constants change in the checker. Hashing, path/symlink validation and all failure checks remain intact. No protection test was modified or disabled. Existing temporary-fixture mutation, deletion, move, rename, directory, line-ending, escaping-path and manifest-tampering tests remain required.
