"""Download only the official inference archive; validate upstream SHA256."""
from pathlib import Path
import ast,hashlib,json,zipfile
import requests
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'research/vision/flyvis_cli__download_pretrained_models.py'
session=requests.Session();session.trust_env=False;session.proxies={'http':'http://127.0.0.1:7897','https':'http://127.0.0.1:7897'}
if not source.exists():
    # The upstream script contains a service key. Keep it out of Git and retrieve
    # the exact author version into the workspace cache when restoring a clone.
    source=ROOT/'.cache/official-sources/flyvis-download.py'
    if not source.exists():
        url='https://raw.githubusercontent.com/TuragaLab/flyvis/92b3845cc426dd309a1a0e1b3890156c42e14021/flyvis_cli/download_pretrained_models.py'
        r=session.get(url,timeout=40)
        if r.status_code!=200:raise RuntimeError(f'Official downloader retrieval failed: HTTP {r.status_code}')
        ast.parse(r.text)
        source.parent.mkdir(parents=True,exist_ok=True);source.write_text(r.text,encoding='utf-8')
tree=ast.parse(source.read_text(encoding='utf-8'))
values={}
for node in ast.walk(tree):
    if isinstance(node,ast.Assign):
        for target in node.targets:
            if isinstance(target,ast.Name) and target.id in ['folder_id','api_key']:
                values[target.id]=ast.literal_eval(node.value)
    elif isinstance(node,ast.AnnAssign) and isinstance(node.target,ast.Name) and node.target.id=='checksums':
        values['checksums']=ast.literal_eval(node.value)
try:
    response=session.get('https://www.googleapis.com/drive/v3/files',params={
        'q':f"'{values['folder_id']}' in parents and mimeType='application/zip'",'fields':'files(id,name,size)','key':values['api_key']},timeout=40)
except requests.RequestException as exc:
    raise RuntimeError('Official listing connection failed: '+type(exc).__name__) from None
if response.status_code!=200:raise RuntimeError(f'Official model listing failed: HTTP {response.status_code}')
items=response.json()['files'];item=next(x for x in items if x['name']=='results_pretrained_models.zip')
folder=ROOT/'data/flyvis';folder.mkdir(parents=True,exist_ok=True);target=folder/item['name']
print(json.dumps({'archive':item['name'],'bytes':item.get('size'),'checksum_length':len(values['checksums'][item['name']])}),flush=True)
if not target.exists():
    with session.get(f"https://www.googleapis.com/drive/v3/files/{item['id']}",params={'alt':'media','key':values['api_key']},stream=True,timeout=120) as r:
        if r.status_code!=200:raise RuntimeError(f'Official download failed: HTTP {r.status_code}')
        total=0
        with target.with_suffix('.part').open('wb') as f:
            for chunk in r.iter_content(1024*1024):
                f.write(chunk);total+=len(chunk)
                if total%(10*1024*1024)<len(chunk):print(f'Downloaded {total//1024//1024} MiB',flush=True)
        target.with_suffix('.part').replace(target)
actual=hashlib.sha256(target.read_bytes()).hexdigest();expected=values['checksums'][item['name']]
if actual!=expected:raise RuntimeError('Official archive checksum does not match. Model was not loaded.')
with zipfile.ZipFile(target) as z:
    for info in z.infolist():
        out=(folder/info.filename).resolve()
        if not out.is_relative_to(folder.resolve()):raise ValueError('Unexpected archive path')
    z.extractall(folder)
(folder/'download-provenance.json').write_text(json.dumps({'source':'TuragaLab/flyvis official pretrained Google Drive archive',
    'upstream_commit':'92b3845cc426dd309a1a0e1b3890156c42e14021','file':item['name'],'bytes':target.stat().st_size,'sha256':actual},indent=2),encoding='utf-8')
print('Official weights verified and unpacked',flush=True)
