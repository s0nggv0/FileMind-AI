"""Validate archive members and allowlist manifest before fresh startup."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath

archive, destination = map(Path, sys.argv[1:3])
workspace = Path(__file__).resolve().parents[1]
assert destination.resolve().parent == (workspace/'artifacts').resolve()
assert destination.name.startswith('phase8-fresh-') and not destination.exists()
with zipfile.ZipFile(archive) as z:
    names = z.namelist()
    assert len(names) == len(set(names))
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in name and ':' not in name
        assert '.env.local' not in path.parts
        assert not name.startswith(('.filemind/storage/', '.filemind/logs/', '.filemind/postgresql/data/'))
    manifest = json.loads(z.read('release-manifest.json'))
    assert set(names) == {entry['path'] for entry in manifest['files']} | {'release-manifest.json'}
    for entry in manifest['files']:
        digest = hashlib.sha256()
        with z.open(entry['path']) as f:
            while chunk := f.read(1024*1024):
                digest.update(chunk)
        assert digest.hexdigest() == entry['sha256'], entry['path']
        assert z.getinfo(entry['path']).file_size == entry['bytes']
    assert z.testzip() is None
    z.extractall(destination)
print(json.dumps({'archiveIntegrity': True, 'manifestFiles': len(manifest['files']), 'noCopiedPrivatePaths': True}))
