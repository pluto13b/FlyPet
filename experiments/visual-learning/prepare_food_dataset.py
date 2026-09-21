"""Preserve user screenshots and crop complete covers; labels/splits remain pending."""
from pathlib import Path
import json,hashlib,shutil
from PIL import Image,ImageDraw,ImageFont
import numpy as np
from scipy.fft import dctn
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'data/food-association-pilot'
sources=[('a8cfd7c5-7f12-4560-b7b8-20383e08af0b',[110,389,668]),
 ('238cd714-89d2-436b-be81-a719f991639d',[168,447,727]),
 ('e3c90aa0-03da-45c3-a3fd-84479468d1fa',[110,389,668]),
 ('965a9f42-db75-43c6-af9a-a8c099c39cb1',[147,427,706]),
 ('35ea7bda-367e-4936-8585-9d87319f204a',[110,389,668])]
for d in ['screenshots','covers','review']:(OUT/d).mkdir(parents=True,exist_ok=True)
records=[];hashes=[]
for page_index,(key,ys) in enumerate(sources,1):
    src=Path('C:/Users/11983/AppData/Local/Temp')/f'codex-clipboard-{key}.png'
    target=OUT/'screenshots'/f'page-{page_index}.png';shutil.copyfile(src,target)
    page=Image.open(target).convert('RGB');sheet=Image.new('RGB',(1200,420),(245,245,245));draw=ImageDraw.Draw(sheet)
    for row,y in enumerate(ys):
        for col,x in enumerate([95,405,715,1024,1334,1643]):
            box=tuple(round(v*s) for v,s in zip((x,y,x+294,y+165),(page.width/2048,page.height/983)*2))
            im=page.crop(box);name=f'p{page_index}-r{row+1}-c{col+1}';relative=f'covers/{name}.png';im.save(OUT/relative)
            arr=np.asarray(im.convert('L').resize((32,32)),dtype=float)
            low=dctn(arr,norm='ortho')[:8,:8].reshape(-1)[1:];bits=low>np.median(low)
            hashes.append(bits)
            records.append({'id':name,'source_page':page_index,'box':box,'file':relative,
                            'label':'pending','split':'unassigned','pixel_sha256':hashlib.sha256(im.tobytes()).hexdigest()})
            thumb=im.copy();thumb.thumbnail((190,108));sheet.paste(thumb,(col*200,row*140))
            draw.text((col*200+4,row*140+112),name,fill=(0,0,0))
    sheet.save(OUT/'review'/f'page-{page_index}-contact.png')
pairs=[]
for i in range(len(records)):
    for j in range(i):
        distance=int(np.count_nonzero(hashes[i]!=hashes[j]))
        if distance<=8:pairs.append({'a':records[j]['id'],'b':records[i]['id'],'phash_distance':distance,
                                    'exact':records[i]['pixel_sha256']==records[j]['pixel_sha256']})
report={'count':len(records),'records':records,'duplicate_candidates':pairs,
        'status':'labels and group splits pending non-food material; pHash candidates require visual review'}
(OUT/'inventory.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'covers':len(records),'duplicate_candidates':pairs}))
