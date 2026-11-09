"""Combine separately installable artifacts; no production state or credentials."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parents[2]
dist = root/'dist'
plugin = dist/'com.kyuubisoft.fivem.streamDeckPlugin'
version = json.loads((root/'plugin/package.json').read_text())['version']
resource = dist/f'ks_streamdeck-{version}.zip'
bundle = dist/f'ks_streamdeck-{version}-bundle.zip'
with zipfile.ZipFile(resource) as source, zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as target:
    for entry in source.infolist():
        if not entry.is_dir(): target.writestr('FiveM/'+entry.filename,source.read(entry))
    target.write(plugin,'StreamDeck/'+plugin.name)
    target.write(root/'README.md','README.md')
    assert target.testzip() is None
for artifact in (plugin,resource,bundle):
    checksum=hashlib.sha256(artifact.read_bytes()).hexdigest()
    artifact.with_name(artifact.name+'.sha256').write_text(f'{checksum}  {artifact.name}\n')
print(bundle)
