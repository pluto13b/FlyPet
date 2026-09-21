"""Small contrast regions from actual pixels, not food labels or world sugar coordinates."""
import math
import numpy as np
from scipy import ndimage
from PIL import Image
from view_geometry import sample_world,SIZE


def regions(grey,camera,limit=3):
    # Closing joins a region's contrast boundary; it does not classify its contents.
    local=np.abs(grey-ndimage.gaussian_filter(grey,12))
    mask=ndimage.binary_closing(local>.075,iterations=3)
    labels,n=ndimage.label(mask)
    found=[]
    for label,slices in enumerate(ndimage.find_objects(labels),1):
        if slices is None:continue
        ys,xs=slices;h,w=ys.stop-ys.start,xs.stop-xs.start
        if min(h,w)<10 or max(h,w)>220:continue
        selected=labels[slices]==label;area=int(selected.sum())
        if area<80:continue
        yy,xx=np.nonzero(selected);strength=local[slices][selected]
        cx=float(np.average(xx+xs.start,weights=strength));cy=float(np.average(yy+ys.start,weights=strength))
        salience=float(strength.mean()*math.sqrt(area))
        # Pad to a square so size/position changes don't become the main learned cue.
        side=max(28,int(max(h,w)*1.3));x0=int(round(cx-side/2));y0=int(round(cy-side/2))
        patch=np.full((side,side),.5,np.float32)
        xa,ya=max(0,x0),max(0,y0);xb,yb=min(SIZE,x0+side),min(SIZE,y0+side)
        patch[ya-y0:yb-y0,xa-x0:xb-x0]=grey[ya:yb,xa:xb]
        image=Image.fromarray(patch)
        descriptor=np.asarray(image.resize((8,8),Image.Resampling.BILINEAR)).ravel().copy()
        descriptor-=descriptor.mean();descriptor/=max(np.linalg.norm(descriptor),1e-12)
        wx,wy=sample_world(camera,cx,cy)
        scale=camera['span']/320;pose=camera['pose']
        x=pose['x']+(wx-camera['x'])/scale;y=pose['y']+(wy-camera['y'])/scale
        found.append({'x':float(x),'y':float(y),'radius':max(10.,side*320/(SIZE-1)/2),
                      'salience':salience,'descriptor':descriptor.tolist(),
                      'pixels':np.asarray(image.resize((SIZE,SIZE),Image.Resampling.BILINEAR)).copy()})
    found.sort(key=lambda r:r['salience'],reverse=True)
    return found[:limit]
