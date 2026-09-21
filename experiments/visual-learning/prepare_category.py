"""Small user-supplied image collection; simple page-held-out split."""
from pathlib import Path
import json,shutil
import numpy as np
from PIL import Image,ImageDraw
from scipy.fft import dctn
ROOT=Path(__file__).resolve().parents[2];DATA=ROOT/'data/food-association-pilot'
records=json.loads((DATA/'inventory.json').read_text())['records']
# Visible content annotations. Ambiguous images are not forced into either class.
exclude={'p1-r1-c2','p1-r1-c4','p1-r1-c6','p1-r2-c4','p1-r3-c3','p2-r2-c6','p2-r3-c5','p3-r2-c4','p4-r1-c4','p4-r3-c1','p5-r1-c5'}
negative={'p1-r2-c5','p2-r2-c5','p2-r3-c3','p3-r1-c4','p3-r3-c4','p4-r2-c4'}
for r in records:
    r['label']=None if r['id'] in exclude else int(r['id'] not in negative)
    r['excluded_reason']='ambiguous visible content' if r['label'] is None else None
specs=[('8a00dbee-05bb-4d92-93af-1a54200e37d8',[21,296,571,842,1116,1390],[153,417,676],263,162),
 ('3b4b9a5a-eaa1-4fe5-b6d4-5fcc72681643',[168,418,668,914,1164,1415],[111,335,559],235,132),
 ('07c6357e-6bfe-408c-93f9-4bda1831c4ea',[17,288,563,842,1122,1398],[75,319,548],260,152)]
for p,(key,xs,ys,w,h) in enumerate(specs,6):
    src=Path('C:/Users/11983/AppData/Local/Temp')/f'codex-clipboard-{key}.png'
    target=DATA/'screenshots'/f'page-{p}.png';shutil.copyfile(src,target)
    image=Image.open(target).convert('RGB');sheet=Image.new('RGB',(1200,420),'white');draw=ImageDraw.Draw(sheet)
    for row,y in enumerate(ys,1):
        for col,x in enumerate(xs,1):
            name=f'p{p}-r{row}-c{col}';box=[x,y,x+w,y+h];im=image.crop(box)
            path=f'covers/{name}.png';im.save(DATA/path)
            records.append({'id':name,'source_page':p,'box':box,'file':path,'label':0,'excluded_reason':None})
            thumb=im.copy();thumb.thumbnail((190,108));sheet.paste(thumb,((col-1)*200,(row-1)*140));draw.text(((col-1)*200+4,(row-1)*140+112),name,fill='black')
    sheet.save(DATA/'review'/f'page-{p}-contact.png')
def phash(path):
    v=dctn(np.array(Image.open(path).convert('L').resize((32,32)),dtype=float),norm='ortho')[:8,:8].ravel()[1:]
    return v>np.median(v)
old=list((ROOT/'output/visual-learning').glob('cover-*.png'))+list((ROOT/'output/visual-learning/new-covers').glob('cover-*.png'))
oldhash=[phash(p) for p in old];seen=[];excluded_matches=[]
for r in records:
    h=phash(DATA/r['file'])
    matches=[str(p.relative_to(ROOT)) for p,v in zip(old,oldhash) if np.count_nonzero(h!=v)<=8]
    dup=[rid for rid,v in seen if np.count_nonzero(h!=v)<=8]
    if matches or dup:
        r['excluded_reason']='previously used image or near duplicate';r['label']=None
        excluded_matches.append({'id':r['id'],'matches':matches+dup})
    seen.append((r['id'],h))
    r['split']='excluded' if r['label'] is None else ('validation' if r['source_page'] in [2,7] else 'test' if r['source_page'] in [4,8] else 'train')
counts={s:{str(c):sum(r['split']==s and r['label']==c for r in records) for c in [0,1]} for s in ['train','validation','test']}
(DATA/'category-dataset.json').write_text(json.dumps({'records':records,'counts':counts,'duplicate_exclusions':excluded_matches},indent=2),encoding='utf-8')
print(json.dumps({'counts':counts,'duplicate_exclusions':excluded_matches},indent=2))
