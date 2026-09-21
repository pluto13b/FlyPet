"""Read-only GitHub research; all downloaded files remain beside this script."""
import json,urllib.request,datetime,concurrent.futures,sys,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parent
repos=['InsectRobotics/IncentiveCircuit','BrainsOnBoard/paper_RPEs_in_drosophila_mb',
 'alitwinkumar/jiang_litwin-kumar_mb_rnn','dtch1997/fly-api','nftechie/doomfly',
 'lixiang1076/fly-brain','NeLy-EPFL/flygym','TuragaLab/flybody',
 'philshiu/Drosophila_brain_model','TuragaLab/flyvis']
opener=urllib.request.build_opener(urllib.request.ProxyHandler({} if '--direct' in sys.argv else {'https':'http://127.0.0.1:7897'}))
def get(url):
    return opener.open(urllib.request.Request(url,headers={'User-Agent':'FlyPet-research'}),timeout=45).read()
def inspect(repo):
    try:
        meta=json.loads(get('https://api.github.com/repos/'+repo))
        commit=json.loads(get(f'https://api.github.com/repos/{repo}/commits/{meta["default_branch"]}'))['sha']
        tree=json.loads(get(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1'))
        directory=ROOT/repo.replace('/','__');directory.mkdir(exist_ok=True)
        (directory/'tree.json').write_text(json.dumps(tree,indent=2),encoding='utf-8')
        docs=[n for n in tree.get('tree',[]) if n['type']=='blob' and '/' not in n['path']
              and n['path'].lower().startswith(('readme','license','requirements','setup.py','pyproject'))]
        if '--metadata-only' not in sys.argv:
            for item in docs:
                blob=json.loads(get(item['url']))
                (directory/item['path']).write_bytes(base64.b64decode(blob['content']))
        return {'repo':repo,'url':meta['html_url'],'stars':meta['stargazers_count'],
                'license':(meta.get('license') or {}).get('spdx_id'),'archived':meta['archived'],
                'pushed_at':meta['pushed_at'],'sha':commit,'tree_truncated':tree.get('truncated',False)}
    except Exception as e:return {'repo':repo,'error':str(e)}
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(inspect,repos))
    report={'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repositories':results}
    (ROOT/'repositories.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
