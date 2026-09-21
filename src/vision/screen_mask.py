"""Exclude our console from sensory images without blocking user screenshots."""
def mask_console(rgb,bounds,rects,food=None):
    # Preserve actual pixels of the visible sugar disc when it overlaps the console.
    import numpy as np
    keep=None
    if food:
        cx=food['x']-bounds['x'];cy=food['y']-bounds['y'];r=food['radius']
        x0=max(0,int(cx-r));y0=max(0,int(cy-r));x1=min(rgb.shape[1],int(cx+r)+1);y1=min(rgb.shape[0],int(cy+r)+1)
        if x1>x0 and y1>y0:
            yy,xx=np.indices((y1-y0,x1-x0));disc=(xx+x0-cx)**2+(yy+y0-cy)**2<=r*r
            keep=(x0,y0,x1,y1,disc,rgb[y0:y1,x0:x1].copy())
    for rect in rects:
        x0=max(0,int(rect['x']-bounds['x']));y0=max(0,int(rect['y']-bounds['y']))
        x1=min(rgb.shape[1],int(rect['x']+rect['width']-bounds['x']))
        y1=min(rgb.shape[0],int(rect['y']+rect['height']-bounds['y']))
        if x1>x0 and y1>y0:rgb[y0:y1,x0:x1]=128
    if keep:
        x0,y0,x1,y1,disc,original=keep;rgb[y0:y1,x0:x1][disc]=original[disc]
    return rgb
