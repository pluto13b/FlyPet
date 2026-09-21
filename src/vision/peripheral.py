"""Screen-anchored coarse change sensing, deliberately not biological optic flow."""
import math
import numpy as np
from PIL import Image

class PeripheralSensor:
    def __init__(self):self.previous=None;self.key=None;self.time=0
    def reset(self):self.previous=None;self.key=None;self.time=0
    def observe(self,rgb,display,camera,stamp):
        scale=camera['span']/320
        width=max(1,math.ceil(display['width']/(16*scale)));height=max(1,math.ceil(display['height']/(16*scale)))
        small=np.asarray(Image.fromarray(rgb).resize((width,height),Image.Resampling.BOX),dtype=np.float32)/255
        gray=small[:,:,0]*.2126+small[:,:,1]*.7152+small[:,:,2]*.0722
        key=(tuple(display[k] for k in ['x','y','width','height']),tuple(tuple(r[k] for k in ['x','y','width','height']) for r in camera.get('excludeRects',[])))
        valid=self.previous is not None and key==self.key and 0<stamp-self.time<=1000
        delta=np.abs(gray-self.previous) if valid else np.zeros_like(gray)
        self.previous=gray;self.key=key;self.time=stamp
        yy,xx=np.indices(gray.shape)
        dx=(display['x']+(xx+.5)*display['width']/width-camera['x'])/scale
        dy=(display['y']+(yy+.5)*display['height']/height-camera['y'])/scale
        distance=np.hypot(dx,dy)
        angle=np.arctan2(dy,dx)-camera['heading']
        sectors=np.floor((angle+math.pi/8)/(math.pi/4)).astype(int)%8
        ring=(distance>=40)&(distance<=480)
        signals=[]
        for i in range(8):
            mask=ring&(sectors==i);values=delta[mask];n=len(values)
            top=max(1,math.ceil(n*.05))
            change=float(np.sort(values)[-top:].mean()) if n else 0.
            signals.append({'sector':i,'brightness':float(gray[mask].mean()) if n else None,
                            'change':change,'samples':n,'bearing':float(camera['heading']+i*math.pi/4)})
        return {'available':True,'source':'desktop','capturedAt':stamp,'pose':camera.get('pose'),
                'radius':480,'sectors':signals,'baselineReady':valid,'sampleDIP':16,
                'kind':'screen-anchored-luminance-change'}
