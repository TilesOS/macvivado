"""Create a verified source-only delivery archive; native archives ship in the app/DMG."""
from pathlib import Path
import os
import zipfile
import hashlib

root = Path(__file__).resolve().parent.parent
release = root / 'release'
release.mkdir(exist_ok=True)
output = release / 'MacVivado-0.1.0-source.zip'
excluded = {'.git', '.cache', 'node_modules', 'dist', 'release', 'test-results', 'playwright-report', '.macvivado'}
files = []
for directory, dirs, names in os.walk(root):
    relative = Path(directory).relative_to(root)
    dirs[:] = [d for d in dirs if d not in excluded and not (relative == Path('resources') and d == 'tools')]
    for name in names:
        source = Path(directory) / name
        if name != '.DS_Store' and not source.is_symlink():
            files.append(source)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for source in sorted(files):
        archive.write(source, Path('MacVivado') / source.relative_to(root))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    print(f'Verified source archive: {len(archive.namelist())} files, {output.stat().st_size} bytes')
checksums = []
for source in [release / 'MacVivado-0.1.0-arm64.dmg', output]:
    if not source.exists():
        continue
    digest = hashlib.sha256()
    with source.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            digest.update(chunk)
    checksums.append(f'{digest.hexdigest()}  {source.relative_to(root)}')
(release / 'SHA256SUMS.txt').write_text('\n'.join(checksums) + '\n')
