# WPAY permanent release signing — full change report

User authorized configuring the newly created WPAY key and explicitly prohibited OTP-file changes. Only the workflow and publishing script change. No Android application source or tests are modified.

The workflow reads WPAY_ANDROID_KEYSTORE_BASE64 and WPAY_ANDROID_KEYSTORE_PASSWORD, restores a temporary PKCS12 key, uses alias wpay, builds an unsigned release APK, and signs it with apksigner. Passwords are passed by environment reference, not command-line values. The temporary key is removed even after failure. Existing unit tests still run before build/publish.

The publisher validates the key fingerprint derived from the provided keystore and allows migration only from the exact previously published legacy APK hash and certificate. Once a release APK is published, a different signing key is rejected. Version increases, source freshness checks, atomic publication to both Railway branches, and artifact metadata remain enforced. Actual signer DN replaces the old hardcoded Android Debug label.

First installation of the new signer requires uninstall/reinstall of the legacy APK and can reset local data/pairing; it is not an in-place signature-compatible update. Future builds with the same release key can update that new installation.

Validation: Python compilation, YAML parse, all workflow shell syntax checks, and mocked SDK tests for expected signer acceptance, wrong signer rejection, exact legacy migration, legacy new-build rejection and altered-legacy rejection passed. Real Android compilation and GitHub secret correctness must be verified by the workflow run. Existing OTP source syntax and test failures are not changed or bypassed.

## .github/workflows/android-apk.yml

### Before
```
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

### After
```
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

      - name: Restore permanent WPAY release key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error::Missing WPAY_ANDROID_KEYSTORE_BASE64 or WPAY_ANDROID_KEYSTORE_PASSWORD."
            exit 1
          fi
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/wpay-release.p12"
          CERT=$(keytool -exportcert -keystore "$RUNNER_TEMP/wpay-release.p12" -storetype PKCS12 -alias wpay -storepass:env KEYSTORE_PASSWORD | sha256sum | cut -d ' ' -f 1)
          echo "WPAY_SIGNER_SHA256=$CERT" >> "$GITHUB_ENV"

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

      - name: Build release APK
        run: gradle --no-daemon -p android-app assembleRelease

      - name: Sign release APK with permanent WPAY key
        env:
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          "$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
            --ks "$RUNNER_TEMP/wpay-release.p12" --ks-key-alias wpay \
            --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
            --out android-app/app/build/outputs/apk/release/app-release.apk \
            android-app/app/build/outputs/apk/release/app-release-unsigned.apk

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/wpay-release.p12"
```

## scripts/publish-android-apk.py

### Before
```
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

### After
```
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
LEGACY_CERT = '27c45dadad724483262f05e623f38000d0c635841a467cf30bd83b5b7a56836a'
LEGACY_APK_SHA256 = '0cf08af217b8fdc84e74f0512b93ffbd2d6cac60974fd63f2034c723d152a502'
CERT = os.environ.get('WPAY_SIGNER_SHA256', '').lower()
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


def inspect(apk, allow_legacy=False):
    if not re.fullmatch(r"[a-f0-9]{64}", CERT):
        raise ValueError("Missing verified WPAY signing certificate fingerprint")
    badging = run(str(SDK / 'aapt'), 'dump', 'badging', str(apk))
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not package or package[1] != PACKAGE:
        raise ValueError('Unexpected APK package')
    signature = run(str(SDK / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk))
    certs = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)', signature)
    legacy = (allow_legacy and len(certs) == 1 and certs[0].lower() == LEGACY_CERT
              and hashlib.sha256(Path(apk).read_bytes()).hexdigest() == LEGACY_APK_SHA256)
    if len(certs) != 1 or (certs[0].lower() != CERT and not legacy):
        raise ValueError('APK signer mismatch; only the exact legacy APK can migrate to the permanent key')
    signer = re.search(r'Signer #1 certificate DN: (.+)', signature)
    if not signer:
        raise ValueError('Missing APK signer identity')
    if 'Verified using v2 scheme (APK Signature Scheme v2): true' not in signature:
        raise ValueError('APK v2 signature verification failed')
    return {'signer': signer[1].strip(), 'signerSha256': certs[0].lower(), 'versionCode': int(package[2]), 'versionName': package[3],
            'minimumAndroidApi': int(re.search(r"sdkVersion:'(\d+)'", badging)[1]),
            'targetAndroidApi': int(re.search(r"targetSdkVersion:'(\d+)'", badging)[1])}


def refs():
    run('git', 'fetch', 'origin', *('refs/heads/' + b + ':refs/remotes/origin/' + b for b in BRANCHES))
    return {b: run('git', 'rev-parse', 'refs/remotes/origin/' + b) for b in BRANCHES}


def existing(commit):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'published.apk'
        path.write_bytes(run('git', 'show', commit + ':' + APK, binary=True))
        return inspect(path, allow_legacy=True)


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
    artifact = Path('android-app/app/build/outputs/apk/release/app-release.apk')
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

## Verified run and SDK-only correction

Run https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/35728754669 successfully restored the new PKCS12 keystore with the supplied password and alias. SDK setup then failed because setup-android v3 defaults to the removed 'tools' package. Main commit f4b8fa5c26c07e906ca62746e2fb5970fe4c40de sets packages: platform-tools; Android 35/build-tools installation remains unchanged. No OTP files edited.

### Complete workflow before SDK correction
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

      - name: Restore permanent WPAY release key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error::Missing WPAY_ANDROID_KEYSTORE_BASE64 or WPAY_ANDROID_KEYSTORE_PASSWORD."
            exit 1
          fi
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/wpay-release.p12"
          CERT=$(keytool -exportcert -keystore "$RUNNER_TEMP/wpay-release.p12" -storetype PKCS12 -alias wpay -storepass:env KEYSTORE_PASSWORD | sha256sum | cut -d ' ' -f 1)
          echo "WPAY_SIGNER_SHA256=$CERT" >> "$GITHUB_ENV"

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

      - name: Build release APK
        run: gradle --no-daemon -p android-app assembleRelease

      - name: Sign release APK with permanent WPAY key
        env:
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          "$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
            --ks "$RUNNER_TEMP/wpay-release.p12" --ks-key-alias wpay \
            --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
            --out android-app/app/build/outputs/apk/release/app-release.apk \
            android-app/app/build/outputs/apk/release/app-release-unsigned.apk

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/wpay-release.p12"
```

### Complete workflow after SDK correction
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

      - name: Restore permanent WPAY release key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error::Missing WPAY_ANDROID_KEYSTORE_BASE64 or WPAY_ANDROID_KEYSTORE_PASSWORD."
            exit 1
          fi
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/wpay-release.p12"
          CERT=$(keytool -exportcert -keystore "$RUNNER_TEMP/wpay-release.p12" -storetype PKCS12 -alias wpay -storepass:env KEYSTORE_PASSWORD | sha256sum | cut -d ' ' -f 1)
          echo "WPAY_SIGNER_SHA256=$CERT" >> "$GITHUB_ENV"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: platform-tools

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

      - name: Build release APK
        run: gradle --no-daemon -p android-app assembleRelease

      - name: Sign release APK with permanent WPAY key
        env:
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          "$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
            --ks "$RUNNER_TEMP/wpay-release.p12" --ks-key-alias wpay \
            --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
            --out android-app/app/build/outputs/apk/release/app-release.apk \
            android-app/app/build/outputs/apk/release/app-release-unsigned.apk

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/wpay-release.p12"
```

## Final automatic-run result

Run https://github.com/gamerpax5-ship-it/upi-intent/actions/runs/35728946228 passed key restoration, Android SDK setup/install, Gradle setup and version preparation. The unit-test step failed during Kotlin compilation, with OtpDetector.kt:62 reporting 'Syntax error: Expecting member declaration' and subsequent orphaned-body errors. No APK was signed or published; the existing download was not replaced. No OTP files were edited to resolve or bypass this failure.

## Trigger on every main code change

Commit 03306f4b4bac4cb881f71382119d1ad6c8c05ebb changes only the workflow push filter. All main pushes now trigger except changes confined to the three generated APK/metadata files, preventing artifact-only rebuilds. Local edits must be pushed to main; other branches must be merged to main. Successful compilation, tests and signature verification are still required before publication. No OTP files changed. This does not fix the previously verified Kotlin compilation error.

### Full workflow before trigger change
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

      - name: Restore permanent WPAY release key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error::Missing WPAY_ANDROID_KEYSTORE_BASE64 or WPAY_ANDROID_KEYSTORE_PASSWORD."
            exit 1
          fi
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/wpay-release.p12"
          CERT=$(keytool -exportcert -keystore "$RUNNER_TEMP/wpay-release.p12" -storetype PKCS12 -alias wpay -storepass:env KEYSTORE_PASSWORD | sha256sum | cut -d ' ' -f 1)
          echo "WPAY_SIGNER_SHA256=$CERT" >> "$GITHUB_ENV"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: platform-tools

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

      - name: Build release APK
        run: gradle --no-daemon -p android-app assembleRelease

      - name: Sign release APK with permanent WPAY key
        env:
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          "$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
            --ks "$RUNNER_TEMP/wpay-release.p12" --ks-key-alias wpay \
            --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
            --out android-app/app/build/outputs/apk/release/app-release.apk \
            android-app/app/build/outputs/apk/release/app-release-unsigned.apk

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/wpay-release.p12"
```

### Full workflow after trigger change
```yaml
name: Build WPAY Android APK

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths-ignore:
      - "public/downloads/WPAY-Agent.apk"
      - "public/downloads/WPAY-Agent.json"
      - "docs/wpay-apk-evidence.json"

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

      - name: Restore permanent WPAY release key
        env:
          KEYSTORE_BASE64: ${{ secrets.WPAY_ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          if [ -z "$KEYSTORE_BASE64" ] || [ -z "$KEYSTORE_PASSWORD" ]; then
            echo "::error::Missing WPAY_ANDROID_KEYSTORE_BASE64 or WPAY_ANDROID_KEYSTORE_PASSWORD."
            exit 1
          fi
          umask 077
          printf '%s' "$KEYSTORE_BASE64" | base64 --decode > "$RUNNER_TEMP/wpay-release.p12"
          CERT=$(keytool -exportcert -keystore "$RUNNER_TEMP/wpay-release.p12" -storetype PKCS12 -alias wpay -storepass:env KEYSTORE_PASSWORD | sha256sum | cut -d ' ' -f 1)
          echo "WPAY_SIGNER_SHA256=$CERT" >> "$GITHUB_ENV"

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: platform-tools

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

      - name: Build release APK
        run: gradle --no-daemon -p android-app assembleRelease

      - name: Sign release APK with permanent WPAY key
        env:
          KEYSTORE_PASSWORD: ${{ secrets.WPAY_ANDROID_KEYSTORE_PASSWORD }}
        shell: bash
        run: |
          set -euo pipefail
          "$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
            --ks "$RUNNER_TEMP/wpay-release.p12" --ks-key-alias wpay \
            --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
            --out android-app/app/build/outputs/apk/release/app-release.apk \
            android-app/app/build/outputs/apk/release/app-release-unsigned.apk

      - name: Verify and publish to both Railway branches
        run: python3 scripts/publish-android-apk.py publish

      - name: Upload verified APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: wpay-agent-update
          path: android-app/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error
          retention-days: 14

      - name: Remove runner signing key
        if: always()
        run: rm -f "$RUNNER_TEMP/wpay-release.p12"
```
