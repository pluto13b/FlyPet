import numpy as np
from screen_mask import mask_console
a=np.full((100,100,3),41,np.uint8)
bounds={'x':-50,'y':20}
rects=[{'x':-40,'y':30,'width':50,'height':50}]
mask_console(a,bounds,rects,{'x':-10,'y':60,'radius':5})
assert np.all(a[10:25,10:25]==128)
assert np.all(a[40,40]==41)
assert np.all(a[:9]==41) and np.all(a[61:]==41)
mask_console(a,bounds,[{'x':500,'y':0,'width':100,'height':100}])
assert np.all(a[40,40]==41)
print('PASS: console masking, negative screen origins, preserved food pixels, nonoverlap')
