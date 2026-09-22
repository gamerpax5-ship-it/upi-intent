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
