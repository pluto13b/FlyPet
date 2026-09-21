"""Distinct UI test images, not new neural mechanisms."""
import numpy as np
LABELS={'desktop':'前方局部视野 · 上远下近（含系统鼠标）','right':'测试：亮块向右移动 →','left':'测试：暗圆向左移动 ←','scroll':'测试：页面向上滚动 ↑'}
def pattern(source,seconds,size=128):
    y,x=np.mgrid[:size,:size]
    phase=(seconds%4)/4
    if source=='right':
        image=np.full((size,size),.12,np.float32)
        center=-20+phase*(size+40)
        image[(np.abs(x-center)<16)&(np.abs(y-size*.5)<28)]=.95
    elif source=='left':
        image=np.full((size,size),.8,np.float32)
        center=size+20-phase*(size+40)
        image[(x-center)**2+(y-size*.5)**2<18**2]=.03
    else:
        image=np.full((size,size),.88,np.float32)
        yy=(y+seconds*25).astype(int)%240
        for i,width in enumerate([75,98,60,89,106,70,90,50,101,78,65,95]):
            image[(yy>=i*18+8)&(yy<i*18+12)&(x>=12)&(x<12+width)]=.2
        image[(yy>=222)&(yy<238)&(x>=12)&(x<85)]=.48
    return image
