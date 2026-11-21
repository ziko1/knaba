"""Prepare one exact, isolated release. Does not start services or publish DNS."""
import datetime, fcntl, hashlib, json, os, pathlib, re, shutil, socket, subprocess, sys, tarfile

release_sha, archive_sha = sys.argv[1:3]
assert re.fullmatch(r'[a-f0-9]{40}', release_sha)
assert re.fullmatch(r'[a-f0-9]{64}', archive_sha)
assert os.geteuid() == 0 and socket.gethostname() == 'knaba'
root = pathlib.Path('/srv/knaba/lead-agent')
assert not root.is_symlink()
root.mkdir(mode=0o700, exist_ok=True)
assert root.stat().st_uid == 0
for name in ['ops', 'private', 'backups', 'releases']:
    p = root / name
    assert not p.is_symlink()
    p.mkdir(mode=0o700, exist_ok=True)
    assert p.stat().st_uid == 0
lock = open(root / 'ops/release.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
assert shutil.disk_usage(root).free > 10 * 1024 ** 3
mem = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
assert int(mem['MemAvailable'].split()[0]) > 4 * 1024 ** 2
release = root / 'releases' / release_sha
assert not release.exists(), 'RELEASE_ALREADY_EXISTS_REQUIRES_RECONCILIATION'
release.mkdir(mode=0o700)
log_path = root / 'ops' / ('build-' + release_sha + '.log')
log = open(log_path, 'x')
os.chmod(log_path, 0o600)

def run(argv, label, timeout=900, capture=False):
    result = subprocess.run(argv, stdout=subprocess.PIPE if capture else log,
                            stderr=log, timeout=timeout, check=False)
    if result.returncode:
        raise RuntimeError(label + '_FAILED')
    return result.stdout if capture else None

try:
    git_dir = root / 'ops/source.git'
    if not git_dir.exists():
        run(['git', 'init', '--bare', str(git_dir)], 'GIT_INIT')
        run(['git', '--git-dir', str(git_dir), 'remote', 'add', 'origin', 'https://github.com/ziko1/knaba.git'], 'GIT_REMOTE')
    remote = run(['git', '--git-dir', str(git_dir), 'remote', 'get-url', 'origin'], 'GIT_ORIGIN', capture=True).decode().strip()
    assert remote == 'https://github.com/ziko1/knaba.git'
    run(['git', '--git-dir', str(git_dir), 'fetch', '--depth=1', 'origin', release_sha], 'GIT_FETCH')
    actual = run(['git', '--git-dir', str(git_dir), 'rev-parse', 'FETCH_HEAD'], 'GIT_IDENTITY', capture=True).decode().strip()
    assert actual == release_sha
    tar_path = release / 'source.tar'
    with tar_path.open('xb') as archive:
        process = subprocess.run(['git', '--git-dir', str(git_dir), 'archive', '--format=tar', release_sha, 'erp'], stdout=archive, stderr=log, timeout=120)
    assert process.returncode == 0
    assert hashlib.sha256(tar_path.read_bytes()).hexdigest() == archive_sha
    with tarfile.open(tar_path) as archive:
        members = archive.getmembers()
        for member in members:
            pure = pathlib.PurePosixPath(member.name)
            assert pure.parts[0] == 'erp' and not pure.is_absolute() and '..' not in pure.parts
            assert member.isdir() or member.isfile(), 'SOURCE_LINK_OR_SPECIAL_FILE_REJECTED'
        for member in members:
            target = release / member.name
            if member.isdir():
                target.mkdir(mode=0o755, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                with target.open('xb') as output, archive.extractfile(member) as source:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)
    run(['docker', 'pull', 'postgres:17.6-bookworm'], 'POSTGRES_IMAGE_PULL', timeout=600)
    pg = json.loads(run(['docker', 'image', 'inspect', 'postgres:17.6-bookworm'], 'POSTGRES_IMAGE_INSPECT', capture=True))[0]
    pg_digest = next(d for d in pg['RepoDigests'] if d.startswith('postgres@sha256:'))
    image = 'knaba-de-api:' + release_sha
    run(['docker', 'build', '--build-arg', 'GIT_SHA=' + release_sha, '--tag', image,
         '--file', str(release / 'erp/infra/Dockerfile'), str(release / 'erp')], 'IMAGE_BUILD', timeout=2400)
    image_info = json.loads(run(['docker', 'image', 'inspect', image], 'IMAGE_INSPECT', capture=True))[0]
    identity = json.loads(run(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'cat', image, '/app/dist/release.json'], 'RELEASE_IDENTITY', capture=True))
    assert identity['code_sha'] == release_sha and identity['source_provenance'] == 'PINNED_CONTAINER_CONTEXT'
    assert image_info['Config']['Labels']['org.opencontainers.image.revision'] == release_sha
    receipt = {'status': 'BUILT_NOT_DEPLOYED', 'source_sha': release_sha, 'source_archive_sha256': archive_sha,
               'source_archive_bytes': tar_path.stat().st_size, 'image': image, 'image_id': image_info['Id'],
               'postgres_image': pg_digest, 'postgres_image_id': pg['Id'], 'release': identity,
               'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'release_path': str(release)}
    receipt_path = root / 'ops' / ('build-' + release_sha + '.json')
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    receipt_path.chmod(0o600)
    print(json.dumps(receipt))
except Exception as error:
    print(json.dumps({'status': 'FAILED', 'stage': str(error)[:160] if isinstance(error, RuntimeError) else type(error).__name__,
                      'source_sha': release_sha, 'log_path': str(log_path), 'no_services_started': True}))
    sys.exit(1)
finally:
    log.close()
