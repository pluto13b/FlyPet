from pathlib import Path
import json
import numpy as np
from cursor_capture import draw_cursor
from test_patterns import pattern

root=Path(__file__).resolve().parents[2]
rgb=np.full((96,96,3),80,np.uint8);before=rgb.copy()
cursor=draw_cursor(rgb,{'x':0,'y':0},position=(32,32))
assert cursor['visible'],'System cursor must be visible for the native cursor test'
assert np.any(rgb!=before),'Cursor pixels were not drawn'
assert np.array_equal(rgb[80:,80:],before[80:,80:])
outside=draw_cursor(rgb,{'x':0,'y':0},position=(-200,-200));assert not outside['visible']
right=pattern('right',1.);left=pattern('left',1.);scroll=pattern('scroll',1.)
assert not np.array_equal(right,left) and not np.array_equal(left,scroll)
def center(image,bright):
    mask=image>.9 if bright else image<.1
    return np.nonzero(mask)[1].mean()
assert center(pattern('right',1.5),True)>center(right,True)
assert center(pattern('left',1.5),False)<center(left,False)
assert not np.array_equal(scroll,pattern('scroll',1.5))
result={'passed':True,'cursor_pixels_changed':int(np.any(rgb!=before,axis=2).sum()),
        'checks':['native cursor composite','offscreen cursor excluded','distinct patterns','correct left/right motion','scroll changes']}
(root/'output/verification/visual-input-tests.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
