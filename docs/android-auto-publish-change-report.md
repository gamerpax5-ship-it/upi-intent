# Android automatic publishing change report — 2026-09-22

## Scope and deployed pairing fixes

User authorized live deployment and automatic APK publishing, while preserving OTP/UTR/deeplink application code.
Backend pairing PR #4 merged at `5fc7772a3fcc870b119fcd9a7bd0632a09a65184`; Railway deployment `4f17f889-5d71-4750-a0b4-22ca5ad8618b` SUCCESS.
Dashboard pairing PR #5 merged at `006b86b2a6fed2d42b5f650abc3d05373ccb96a6`; Railway deployment `1dd0c553-549e-489b-a68d-096ff6f7fa95` SUCCESS, hosted readiness check passed.
Actual user activation and physical Android device pairing have not been exercised. Container network access to the live endpoint timed out; deployment success is not an end-to-end pairing claim.
Pairing complete before/after code is in `docs/pairing-service-change-report.md` on both deployed branches.

## Exactly what changes here

1. Replace `.github/workflows/android-apk.yml` with the complete version below.
2. Add `scripts/publish-android-apk.py` with the complete version below.
3. Add this report. No Android application source, OTP route/detector, UTR parser/capture, deeplink or dashboard business logic is modified by this change.

Reason: the old workflow used a fresh runner debug signing identity, fixed versionCode, and copied the APK to main only. Its rebase could misattribute the build source. The dashboard also requires matching APK verification evidence. The replacement restores the original signing identity, increments the version, verifies the actual APK, and atomically commits APK + metadata + evidence to main and wpay/hosted-integration. Railway's configured branch auto-deploy then consumes these commits. The services remain separate because their entrypoints and databases differ.

Triggers: changes under android-app/**, this workflow, or the publisher script on main; manual Run workflow on main is also supported. Backend-only changes continue using existing Railway GitHub deployment; they need no APK rebuild. No force pushes, test skipping, protection-manifest changes, or new signing identity fallback.

Only the CI runner's temporary copy of android-app/app/build.gradle.kts gets a build version override: versionCode becomes one greater than the maximum of source/main APK/hosted APK; versionName becomes source versionName + '+build.' + new versionCode. This temporary Gradle change is never committed. Source applicationId and API URL remain unchanged. The published file paths stay public/downloads/WPAY-Agent.apk and WPAY-Agent.json. Matching docs/wpay-apk-evidence.json is generated from actual aapt/apksigner output.

## Remaining prerequisites — not completed by this change

- GitHub Actions secret `WPAY_ANDROID_DEBUG_KEYSTORE_BASE64` must contain base64 of the ORIGINAL debug.keystore that signed the current published APK (alias androiddebugkey, store password android, default Android debug key password). The workflow requires certificate SHA-256 `27c45dadad724483262f05e623f38000d0c635841a467cf30bd83b5b7a56836a`. Do not send the private key in chat or commit it. The connected GitHub tool cannot configure/read Actions secrets. An unrelated or newly generated debug key will deliberately fail. If the original private key from the old build runner was not retained, it cannot be recovered from the APK; updating that installed app with a new signer is not possible through this pipeline.
- Current main OtpDetector.kt blob `3882b6657cb69aa7d4ff92b1bde45d294faf4108` still has `fun detect(body: String): DetectedOtp? = null` followed by statements from the old function body outside a function and an extra closing brace. This is a Kotlin compile blocker, not a request to restore OTP behavior. It was not edited because of the user's explicit restriction. Existing tests must also pass; none are skipped or modified here.
- This automates website APK replacement and Railway deployment, not silent installation on users' phones. With matching package and signing key and a greater versionCode, the downloaded APK can update the installed app. Android installation consent still applies. No in-app updater has been added.
- A branch move or protection rejection during atomic publication aborts both ref changes. Rerun the workflow on latest main after resolving the reported failure. The existing website artifact stays available after build/test/signature failures.

## Validation

Python compilation and workflow YAML parsing passed. A disposable local Git integration fixture with mocked Android SDK commands passed: mismatched signer leaves refs unchanged; dual-branch atomic publication; matching artifacts; source SHA attribution; source Gradle unchanged in published commits; repeat/equal version publication rejected. These tests are not real Android compilation/signature validation or Railway deployment of a new APK.
Full repository npm, PostgreSQL, and protected-legacy checks were not run from the partial local checkout. Protected artifact hashes are intentionally not rebased or weakened; their old frozen baseline will require a separately reviewed baseline decision for any newly authorized APK artifact update. Android unit tests remain mandatory in the workflow.

## Post-deployment verification (2026-09-22)

PR #6 merged into main at `96fba90d6e022fe751332a9353b88c62bae7f1e3`. Backend Railway deployment `e4d2709f-1155-418a-8010-51194c35a98f` is SUCCESS; dashboard deployment `1dd0c553-549e-489b-a68d-096ff6f7fa95` remains SUCCESS.

[First automatic APK workflow run](https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/35724864675) triggered successfully. Job 106735998194 failed at Restore existing APK signing key with: Missing WPAY_ANDROID_DEBUG_KEYSTORE_BASE64. Build/test/publish steps did not execute. No new APK was published. The missing keystore is confirmed by the running workflow, not just an inference.

[Backend CI](https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/35724864623): four tests in test/device-otp-router.test.js still expect the previous OTP storage/access behavior and fail after the user's disabling change. The tests were not altered or skipped; OTP behavior was not re-enabled.

[Hosted acceptance CI](https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/35724250963): protected-source checks, syntax, and full legacy/WPay unit suite passed. Actual PostgreSQL/HTTP/MFA tests passed; a later acceptance group reported 9 failures, beginning with a migration-count assertion (actual 18, expected 16), followed by missing fixture values/invalid requests. These were not repaired as part of the requested packaging/pairing-only changes. The deployment is live, but this does not establish that all dashboard acceptance flows pass.

Android signing continuity requirement: https://developer.android.com/studio/publish/app-signing . Original signing-key availability remains necessary; the new workflow cannot recover a lost key from the APK.

## Complete workflow BEFORE

```yaml
name: Build WPAY Android APK

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "android-app/**"
      - ".github/workflows/android-apk.yml"

permissions:
  contents: write

concurrency:
  group: wpay-agent-apk-publish
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android 35 SDK
        run: sdkmanager "platforms;android-35" "build-tools;35.0.0"

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: "8.10.2"

      - name: Run unit tests
        run: gradle --no-daemon -p android-app testDebugUnitTest

      - name: Build debug APK
        run: gradle --no-daemon -p android-app assembleDebug

      - name: Publish APK into dashboard
        run: |
          git pull --rebase origin main
          mkdir -p public/downloads
          cp android-app/app/build/outputs/apk/debug/app-debug.apk public/downloads/WPAY-Agent.apk
          VERSION=$(sed -n 's/.*versionName = "\([^"]*\)".*/\1/p' android-app/app/build.gradle.kts | head -n 1)
          COMMIT=$(git rev-parse HEAD)
          BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
          printf '{"version":"%s","commit":"%s","builtAt":"%s"}\n' "$VERSION" "$COMMIT" "$BUILT_AT" > public/downloads/WPAY-Agent.json
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/downloads/WPAY-Agent.apk public/downloads/WPAY-Agent.json
          if git diff --cached --quiet; then
            echo "APK unchanged"
          else
            git commit -m "Publish latest WPAY Agent APK [skip ci]"
            git push origin HEAD:main
          fi

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-debug
          path: android-app/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
          retention-days: 14

```

## Complete workflow AFTER

```yaml
name: Build WPAY Android APK

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "android-app/**"
      - ".github/workflows/android-apk.yml"
      - "scripts/publish-android-apk.py"

permissions:
  contents: write

concurrency:
  group: wpay-agent-apk-publish
  cancel-in-progress: false

jobs:
  build:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout exact source
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Restore existing APK signing key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_DEBUG_KEYSTORE_BASE64 }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ]; then
            echo "::error::Missing WPAY_ANDROID_DEBUG_KEYSTORE_BASE64. Restore the original APK debug.keystore; a new key cannot update existing installations."
            exit 1
          fi
          mkdir -p "$HOME/.android"
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$HOME/.android/debug.keystore"
          CERT=$(keytool -exportcert -keystore "$HOME/.android/debug.keystore" -alias androiddebugkey -storepass android | sha256sum | cut -d ' ' -f 1)
          if [ "$CERT" != "27c45dadad724483262f05e623f38000d0c635841a467cf30bd83b5b7a56836a" ]; then
            echo "::error::Signing certificate does not match the existing published APK."
            exit 1
          fi

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android 35 SDK
        run: sdkmanager "platforms;android-35" "build-tools;35.0.0"

      - name: Set up Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: "8.10.2"

      - name: Prepare increasing update version
        run: python3 scripts/publish-android-apk.py prepare

      - name: Run unit tests
        run: gradle --no-daemon -p android-app testDebugUnitTest

      - name: Build APK with existing signing identity
        run: gradle --no-daemon -p android-app assembleDebug

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$HOME/.android/debug.keystore"
```

## New publisher file (BEFORE: absent)

```python
#!/usr/bin/env python3
"""Build metadata and atomically publish one verified APK to both Railway branches."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

PACKAGE = 'org.wtron.wpayagent'
CERT = '27c45dadad724483262f05e623f38000d0c635841a467cf30bd83b5b7a56836a'
BRANCHES = ('main', 'wpay/hosted-integration')
APK = 'public/downloads/WPAY-Agent.apk'
META = 'public/downloads/WPAY-Agent.json'
EVIDENCE = 'docs/wpay-apk-evidence.json'
INPUTS = ('android-app', '.github/workflows/android-apk.yml', 'scripts/publish-android-apk.py')
SDK = Path(os.environ.get('ANDROID_HOME', os.environ.get('ANDROID_SDK_ROOT', ''))) / 'build-tools/35.0.0'
STATE = Path(os.environ.get('RUNNER_TEMP', tempfile.gettempdir())) / 'wpay-apk-state.json'


def run(*args, cwd=None, binary=False):
    output = subprocess.check_output(args, cwd=cwd, text=not binary)
    return output if binary else output.strip()


def inspect(apk):
    badging = run(str(SDK / 'aapt'), 'dump', 'badging', str(apk))
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not package or package[1] != PACKAGE:
        raise ValueError('Unexpected APK package')
    signature = run(str(SDK / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk))
    certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)', signature)
    if len(certs) != 1 or certs[0].lower() != CERT:
        raise ValueError('APK signer differs from the existing published APK; publication blocked')
    if 'Verified using v2 scheme (APK Signature Scheme v2): true' not in signature:
        raise ValueError('APK v2 signature verification failed')
    return {'versionCode': int(package[2]), 'versionName': package[3],
            'minimumAndroidApi': int(re.search(r"sdkVersion:'(\d+)'", badging)[1]),
            'targetAndroidApi': int(re.search(r"targetSdkVersion:'(\d+)'", badging)[1])}


def refs():
    run('git', 'fetch', 'origin', *('refs/heads/' + b + ':refs/remotes/origin/' + b for b in BRANCHES))
    return {b: run('git', 'rev-parse', 'refs/remotes/origin/' + b) for b in BRANCHES}


def existing(commit):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'published.apk'
        path.write_bytes(run('git', 'show', commit + ':' + APK, binary=True))
        return inspect(path)


def prepare():
    if os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Publishing is allowed only from main')
    source = run('git', 'rev-parse', 'HEAD')
    heads = refs()
    if heads['main'] != source:
        raise ValueError('Main moved before build; run the workflow on current main')
    gradle = Path('android-app/app/build.gradle.kts')
    original = gradle.read_text()
    match = re.search(r'\bversionCode\s*=\s*(\d+)', original)
    name = re.search(r'\bversionName\s*=\s*"([^"]+)"', original)
    if not match or not name:
        raise ValueError('Cannot determine Android version')
    version = max(int(match[1]), *(existing(h)['versionCode'] for h in heads.values())) + 1
    if version > 2100000000:
        raise ValueError('Android versionCode limit reached')
    updated = original[:match.start(1)] + str(version) + original[match.end(1):]
    updated = re.sub(r'(\bversionName\s*=\s*)"[^"]+"', lambda m: m[1] + json.dumps(name[1] + '+build.' + str(version)), updated, count=1)
    gradle.write_text(updated)
    STATE.write_text(json.dumps({'source': source, 'version': version}))
    print('Prepared versionCode', version, '(runner workspace only; source Gradle file is not committed)')


def publish():
    state = json.loads(STATE.read_text())
    artifact = Path('android-app/app/build/outputs/apk/debug/app-debug.apk')
    details = inspect(artifact)
    if details['versionCode'] != state['version']:
        raise ValueError('Built version differs from prepared version')
    heads = refs()
    if run('git', 'diff', '--name-only', state['source'], heads['main'], '--', *INPUTS):
        raise ValueError('Android or publishing code changed during build; stale publication blocked')
    if any(existing(h)['versionCode'] >= details['versionCode'] for h in heads.values()):
        raise ValueError('A newer or equal APK has already been published')
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
    data = artifact.read_bytes()
    metadata = {'version': details['versionName'], 'versionCode': details['versionCode'],
                'commit': state['source'], 'builtAt': now}
    evidence = {'artifact': APK, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                'package': PACKAGE, **details, 'signatureVerified': True, 'signatureScheme': 'v2',
                'signer': 'C=US, O=Android, CN=Android Debug', 'signerSha256': CERT,
                'inspectedOn': now[:10], 'tools': 'Android SDK build-tools 35.0.0 aapt dump badging and apksigner verify --verbose --print-certs'}
    commits = []
    with tempfile.TemporaryDirectory() as tmp:
        try:
            for index, (branch, head) in enumerate(heads.items()):
                checkout = Path(tmp) / str(index)
                run('git', 'worktree', 'add', '--detach', str(checkout), head)
                for relative, content in ((APK, data), (META, (json.dumps(metadata, indent=2) + '\n').encode()),
                                          (EVIDENCE, (json.dumps(evidence, indent=2) + '\n').encode())):
                    target = checkout / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(content)
                run('git', 'add', '--', APK, META, EVIDENCE, cwd=checkout)
                run('git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
                    'commit', '-m', 'Publish verified WPAY Agent APK ' + details['versionName'], cwd=checkout)
                commits.append(run('git', 'rev-parse', 'HEAD', cwd=checkout) + ':refs/heads/' + branch)
            # Both branches update together, or neither does. Never force push.
            run('git', 'push', '--atomic', 'origin', *commits)
        finally:
            for index in range(len(heads)):
                subprocess.run(['git', 'worktree', 'remove', '--force', str(Path(tmp) / str(index))], check=False, stdout=subprocess.DEVNULL)
    print('Published verified APK and matching evidence to both Railway source branches')


if __name__ == '__main__':
    if len(sys.argv) != 2 or sys.argv[1] not in ('prepare', 'publish'):
        raise SystemExit('Usage: publish-android-apk.py prepare|publish')
    try:
        globals()[sys.argv[1]]()
    except (ValueError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
```
