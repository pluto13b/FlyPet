"""Body-relative planar view adaptation; not a biological eye-optics model."""
import math
import numpy as np
from PIL import Image

SIZE=403
def coefficients(view,size=SIZE):
    f=(math.cos(view['heading']),math.sin(view['heading']))
    right=(-f[1],f[0]);pitch=view['span']/(size-1);c=(size-1)/2
    return (right[0]*pitch,-f[0]*pitch,view['x']+f[0]*(view['forward']+c*pitch)-right[0]*c*pitch,
            right[1]*pitch,-f[1]*pitch,view['y']+f[1]*(view['forward']+c*pitch)-right[1]*c*pitch)

def sample_world(view,x,y,size=SIZE):
    a,b,c,d,e,f=coefficients(view,size)
    return a*x+b*y+c,d*x+e*y+f

def project_point(view,x,y,size=SIZE):
    dx=x-view['x'];dy=y-view['y'];c=(size-1)/2;scale=(size-1)/view['span']
    forward=dx*math.cos(view['heading'])+dy*math.sin(view['heading'])
    right=-dx*math.sin(view['heading'])+dy*math.cos(view['heading'])
    return c+right*scale,c-(forward-view['forward'])*scale

def capture_region(view,size=SIZE):
    corners=[sample_world(view,x,y,size) for x in [0,size-1] for y in [0,size-1]]
    display=view['display']
    left=max(display['x'],math.floor(min(p[0] for p in corners))-1)
    top=max(display['y'],math.floor(min(p[1] for p in corners))-1)
    right=min(display['x']+display['width'],math.ceil(max(p[0] for p in corners))+2)
    bottom=min(display['y']+display['height'],math.ceil(max(p[1] for p in corners))+2)
    return {'x':left,'y':top,'width':max(0,right-left),'height':max(0,bottom-top)}

def orient_image(rgb,region,view,size=SIZE):
    if region['width']==0 or region['height']==0:return np.full((size,size,3),128,np.uint8)
    a,b,c,d,e,f=coefficients(view,size)
    transform=(a,b,c-region['x'],d,e,f-region['y'])
    return np.asarray(Image.fromarray(rgb).transform((size,size),Image.Transform.AFFINE,transform,
        Image.Resampling.BILINEAR,fillcolor=(128,128,128))).copy()
