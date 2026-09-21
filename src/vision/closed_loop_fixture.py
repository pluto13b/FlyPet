"""Test-only virtual screen. Production vision/learning receives pixels through its usual path."""
import sys,json
import numpy as np
from PIL import Image,ImageDraw
import worker
worker.draw_cursor=lambda *args:{'visible':False}

class Screen:
    def __init__(self):self.point=(405,300);self.visible=True
    def grab(self,r):
        image=Image.new('RGB',(800,600),(24,29,31));d=ImageDraw.Draw(image)
        if self.visible:
            x,y=self.point;d.ellipse((x-20,y-20,x+20,y+20),fill=(40,216,189))
        rgb=np.asarray(image.crop((r['left'],r['top'],r['left']+r['width'],r['top']+r['height'])))
        return np.concatenate([rgb[:,:,::-1],np.full((*rgb.shape[:2],1),255,np.uint8)],axis=2)
    def close(self):pass

observer=worker.Observer();observer.capture.close();observer.capture=Screen()
print(json.dumps({'ready':True}),flush=True)
for line in sys.stdin:
    msg=json.loads(line)
    if msg['command']=='quit':break
    try:
        if msg['command']=='world':
            observer.capture.point=msg.get('point',(405,300));observer.capture.visible=msg.get('visible',True);result={'ok':True}
        elif msg['command']=='observe':result=observer.observe(msg)
        else:result=observer.command(msg)
        print(json.dumps({'id':msg.get('id'),'result':result}),flush=True)
    except Exception as e:print(json.dumps({'id':msg.get('id'),'error':str(e)}),flush=True)
