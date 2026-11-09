from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]/'assets'/'characters'
files=[root/'ranger-parts.png', *sorted((root/'rigs').glob('*.png'))]
for path in files:
 im=Image.open(path).convert('RGBA')
 regions=[]
 for row in range(4):
  for col in range(4):
   x0,y0=int(col*im.width/4),int(row*im.height/4)
   x1,y1=int((col+1)*im.width/4),int((row+1)*im.height/4)
   alpha=im.getchannel('A').crop((x0,y0,x1,y1))
   bbox=alpha.point(lambda v:255 if v>=160 else 0).getbbox()
   if not bbox: raise ValueError(f'Empty atlas cell: {path} {row} {col}')
   a,b,c,d=bbox
   a,b=max(0,a-2),max(0,b-2)
   c,d=min(x1-x0,c+2),min(y1-y0,d+2)
   regions.append([x0+a,y0+b,c-a,d-b])
 path.with_suffix('.json').write_text(json.dumps({'regions':regions},indent=2)+'\n')
print(f'{len(files)} atlas: metadata generated; PNG pixels unchanged')
