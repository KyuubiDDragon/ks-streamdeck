#!/usr/bin/env python3
"""Build the standalone resource ZIP without the repository or Node dependencies."""
import argparse
import hashlib
import re
import zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
version = re.search(r"^version\s*(?:\(\s*)?'([^']+)'", (root/'fxmanifest.lua').read_text(), re.M)[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=Path.cwd()/'dist'/f'ks_streamdeck-{version}.zip')
args = parser.parse_args()
files = [root/name for name in ('fxmanifest.lua','config.lua')]
for folder in ('client','html','adapters','examples','tests'):
    files.extend(file for file in (root/folder).rglob('*') if file.is_file() and file.suffix in ('.lua','.html','.js','.py'))
args.output.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(args.output,'w',zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files): archive.write(file,Path('ks_streamdeck')/file.relative_to(root))
    guide = root/'README.md'
    if not guide.exists(): guide = root.parents[1]/'README.md'
    archive.write(guide, 'ks_streamdeck/README.md')
    archive.write(guide.with_name('README.de.md'), 'ks_streamdeck/README.de.md')
    assert archive.testzip() is None
checksum = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_suffix('.zip.sha256').write_text(f'{checksum}  {args.output.name}\n')
print(f'{args.output.resolve()}\n{len(files)} files; SHA256 {checksum}')
