"""GLB内の画像をJPEGに差し替えて軽くする。透明を使っていない素材だけに使うこと。
使い方: python tools/glb-jpeg.py in.glb out.glb [基本色の品質] [法線の辺の長さ]
"""
import json, struct, sys, io
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
q_base = int(sys.argv[3]) if len(sys.argv) > 3 else 82
normal_size = int(sys.argv[4]) if len(sys.argv) > 4 else 512

data = open(src, 'rb').read()
assert data[:4] == b'glTF'
jlen = struct.unpack('<I', data[12:16])[0]
j = json.loads(data[20:20 + jlen])
boff = 20 + jlen
blen = struct.unpack('<I', data[boff:boff + 4])[0]
bin_ = data[boff + 8:boff + 8 + blen]

# どの画像が法線か
normal_imgs = set()
for m in j.get('materials', []):
    if 'normalTexture' in m:
        normal_imgs.add(j['textures'][m['normalTexture']['index']]['source'])
for m in j.get('materials', []):
    assert m.get('alphaMode', 'OPAQUE') == 'OPAQUE', '透明を使う素材にJPEGは使えない'

image_views = {}
for i, im in enumerate(j.get('images', [])):
    bv = j['bufferViews'][im['bufferView']]
    raw = bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    img = Image.open(io.BytesIO(raw)).convert('RGB')
    if i in normal_imgs and img.width > normal_size:
        img = img.resize((normal_size, normal_size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=92 if i in normal_imgs else q_base, optimize=True)
    image_views[im['bufferView']] = out.getvalue()
    im['mimeType'] = 'image/jpeg'
    print(f"  {im.get('name')}: {len(raw)/1024:.0f}KB -> {len(out.getvalue())/1024:.0f}KB {img.size}")

# バッファを組み直す(4バイト境界にそろえる)
chunks, off = [], 0
for i, bv in enumerate(j['bufferViews']):
    if i in image_views:
        b = image_views[i]
    else:
        b = bin_[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    pad = (-off) % 4
    if pad: chunks.append(b'\x00' * pad); off += pad
    bv['byteOffset'] = off; bv['byteLength'] = len(b)
    chunks.append(b); off += len(b)
newbin = b''.join(chunks)
newbin += b'\x00' * ((-len(newbin)) % 4)
j['buffers'][0]['byteLength'] = len(newbin)
js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
total = 12 + 8 + len(js) + 8 + len(newbin)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(newbin), 0x004E4942)); f.write(newbin)
print(f"{src} -> {dst}: {len(data)/1e6:.2f}MB -> {total/1e6:.2f}MB")
