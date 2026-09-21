"""Coordinate regression checks without loading or changing the neural model."""
import math,json
from pathlib import Path
import numpy as np
from view_geometry import SIZE,project_point,sample_world,capture_region,orient_image

cases=0
for scale in (1,1.25,1.5):
    for heading in (0,math.pi/2,math.pi,3*math.pi/2,.73):
        view={'x':-500*scale,'y':400*scale,'heading':heading,'span':320*scale,'forward':80*scale,
              'display':{'x':-1920*scale,'y':0,'width':1920*scale,'height':1080*scale}}
        f=np.array([math.cos(heading),math.sin(heading)]);r=np.array([-f[1],f[0]])
        origin=np.array([view['x'],view['y']]);center=origin+view['forward']*f
        np.testing.assert_allclose(project_point(view,*center),(201,201),atol=1e-9)
        assert project_point(view,*(center+40*scale*f))[1]<201
        assert project_point(view,*(origin-40*scale*f))[1]>201
        assert project_point(view,*(center+40*scale*r))[0]>201
        for pixel in ((0,0),(201,201),(83,310),(402,402)):
            np.testing.assert_allclose(project_point(view,*sample_world(view,*pixel)),pixel,atol=1e-9)
        # A cursor-like patch follows the same transform as its projected marker.
        region=capture_region(view)
        rgb=np.zeros((region['height'],region['width'],3),np.uint8)
        marker=sample_world(view,250,150)
        x,y=round(marker[0]-region['x']),round(marker[1]-region['y'])
        rgb[y-4:y+5,x-4:x+5]=255
        result=orient_image(rgb,region,view)
        ys,xs=np.nonzero(result[:,:,0]>200)
        assert len(xs)>0 and abs(xs.mean()-250)<2 and abs(ys.mean()-150)<2
        cases+=1

view={'x':5,'y':100,'heading':math.pi,'span':320,'forward':80,
      'display':{'x':0,'y':0,'width':800,'height':600}}
region=capture_region(view)
rgb=np.full((region['height'],region['width'],3),240,np.uint8)
result=orient_image(rgb,region,view)
np.testing.assert_array_equal(result[201,201],(128,128,128))
np.testing.assert_allclose(sample_world(view,201,201),(-75,100),atol=1e-9)
assert result[350,201,0]==240
report={'passed':True,'directionScaleCases':cases,'checks':['front/back/right','inverse coordinates',
        'image and marker alignment','negative display origin','edge padding without center shift']}
out=Path(__file__).resolve().parents[2]/'output/verification/view-geometry-tests.json'
out.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
