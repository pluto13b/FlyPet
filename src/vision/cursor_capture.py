"""Composite the real Windows cursor into RGB screen pixels before neural sampling."""
import ctypes as ct
from ctypes import wintypes as wt
import numpy as np

class POINT(ct.Structure): _fields_=[('x',wt.LONG),('y',wt.LONG)]
class CURSORINFO(ct.Structure): _fields_=[('size',wt.DWORD),('flags',wt.DWORD),('cursor',wt.HANDLE),('position',POINT)]
class ICONINFO(ct.Structure): _fields_=[('icon',wt.BOOL),('hotX',wt.DWORD),('hotY',wt.DWORD),('mask',wt.HANDLE),('color',wt.HANDLE)]
class BITMAP(ct.Structure):
    _fields_=[('kind',wt.LONG),('width',wt.LONG),('height',wt.LONG),('stride',wt.LONG),('planes',wt.WORD),('bitsPerPixel',wt.WORD),('bits',ct.c_void_p)]
class HEADER(ct.Structure):
    _fields_=[('size',wt.DWORD),('width',wt.LONG),('height',wt.LONG),('planes',wt.WORD),('bitCount',wt.WORD),
              ('compression',wt.DWORD),('imageSize',wt.DWORD),('xppm',wt.LONG),('yppm',wt.LONG),('used',wt.DWORD),('important',wt.DWORD)]
class INFO(ct.Structure): _fields_=[('header',HEADER),('colors',wt.DWORD*3)]

user=ct.WinDLL('user32',use_last_error=True);gdi=ct.WinDLL('gdi32',use_last_error=True)
user.GetCursorInfo.argtypes=[ct.POINTER(CURSORINFO)];user.GetCursorInfo.restype=wt.BOOL
user.GetIconInfo.argtypes=[wt.HANDLE,ct.POINTER(ICONINFO)];user.GetIconInfo.restype=wt.BOOL
user.DrawIconEx.argtypes=[wt.HANDLE,ct.c_int,ct.c_int,wt.HANDLE,ct.c_int,ct.c_int,wt.UINT,wt.HANDLE,wt.UINT];user.DrawIconEx.restype=wt.BOOL
gdi.GetObjectW.argtypes=[wt.HANDLE,ct.c_int,ct.c_void_p];gdi.GetObjectW.restype=ct.c_int
gdi.CreateCompatibleDC.argtypes=[wt.HANDLE];gdi.CreateCompatibleDC.restype=wt.HANDLE
gdi.CreateDIBSection.argtypes=[wt.HANDLE,ct.POINTER(INFO),wt.UINT,ct.POINTER(ct.c_void_p),wt.HANDLE,wt.DWORD];gdi.CreateDIBSection.restype=wt.HANDLE
gdi.SelectObject.argtypes=[wt.HANDLE,wt.HANDLE];gdi.SelectObject.restype=wt.HANDLE
gdi.DeleteObject.argtypes=[wt.HANDLE];gdi.DeleteObject.restype=wt.BOOL
gdi.DeleteDC.argtypes=[wt.HANDLE];gdi.DeleteDC.restype=wt.BOOL

def draw_cursor(rgb,bounds,position=None):
    """Mutate RGB pixels. Optional position is only for deterministic tests, not OS movement."""
    current=CURSORINFO();current.size=ct.sizeof(current)
    if not user.GetCursorInfo(ct.byref(current)) or not current.flags&1:return {'visible':False}
    icon=ICONINFO()
    if not user.GetIconInfo(current.cursor,ct.byref(icon)):return {'visible':False}
    dc=bitmap=old=None
    try:
        details=BITMAP();gdi.GetObjectW(icon.color or icon.mask,ct.sizeof(details),ct.byref(details))
        w=details.width;h=details.height if icon.color else details.height//2
        if w<=0 or h<=0:return {'visible':False}
        px,py=position if position is not None else (current.position.x,current.position.y)
        x=px-int(icon.hotX)-bounds['x'];y=py-int(icon.hotY)-bounds['y']
        x0=max(0,x);y0=max(0,y);x1=min(rgb.shape[1],x+w);y1=min(rgb.shape[0],y+h)
        if x0>=x1 or y0>=y1:return {'visible':False}
        backing=np.zeros((h,w,4),np.uint8);backing[:,:,3]=255
        backing[y0-y:y1-y,x0-x:x1-x,:3]=rgb[y0:y1,x0:x1,::-1]
        info=INFO();info.header=HEADER(ct.sizeof(HEADER),w,-h,1,32,0,w*h*4,0,0,0,0)
        dc=gdi.CreateCompatibleDC(None);address=ct.c_void_p()
        bitmap=gdi.CreateDIBSection(dc,ct.byref(info),0,ct.byref(address),None,0)
        if not bitmap:raise ct.WinError(ct.get_last_error())
        old=gdi.SelectObject(dc,bitmap);ct.memmove(address,backing.ctypes.data,backing.nbytes)
        if not user.DrawIconEx(dc,0,0,current.cursor,w,h,0,None,3):raise ct.WinError(ct.get_last_error())
        result=np.ctypeslib.as_array((ct.c_ubyte*(w*h*4)).from_address(address.value)).reshape(h,w,4)
        rgb[y0:y1,x0:x1]=result[y0-y:y1-y,x0-x:x1-x,:3][:,:,::-1]
        return {'visible':True,'x':px-bounds['x'],'y':py-bounds['y'],'width':w,'height':h}
    finally:
        if old:gdi.SelectObject(dc,old)
        if bitmap:gdi.DeleteObject(bitmap)
        if dc:gdi.DeleteDC(dc)
        if icon.color:gdi.DeleteObject(icon.color)
        if icon.mask:gdi.DeleteObject(icon.mask)
