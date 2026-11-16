# Quita del modelo del Perseverance los logos de la NASA, del JPL y el logotipo de Mars 2020 (no son de dominio público):
# los tapa en las texturas con el color de alrededor y reescribe el .glb. El nombre «PERSEVERANCE» se queda.
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
d = open(src, 'rb').read()
n = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20+n]); o = 20+n
m = struct.unpack('<I', d[o:o+4])[0]; b = d[o+8:o+8+m]

def filas(im, x0, y0, x1, y1):
    """Rellena cada fila entre el color de su izquierda y el de su derecha (media de 3 px fuera del rectángulo)."""
    px = im.load()
    for y in range(y0, y1):
        a = [sum(px[x0-4+k, y][c] for k in range(3))/3 for c in range(3)]
        z = [sum(px[x1+1+k, y][c] for k in range(3))/3 for c in range(3)]
        for x in range(x0, x1):
            t = (x-x0)/max(1, x1-x0-1)
            px[x, y] = tuple(round(a[c]*(1-t)+z[c]*t) for c in range(3))

def arreglar(nombre, im):
    k = im.size[0]/ (512 if nombre == 'arm_graphics' else 1024)
    r = lambda *v: [round(x*k) for x in v]
    if nombre == 'arm_graphics':
        filas(im, *r(6, 22, 500, 92))       # «MARS 2020», su icono y la línea de crédito
        filas(im, *r(106, 272, 292, 340))   # emblema de la NASA y logo del JPL sobre la placa
    else:                                    # mars_2020_03: las placas en relieve del chasis
        filas(im, *r(183, 891, 283, 937))   # «NASA»
        filas(im, *r(392, 838, 471, 889))   # «JPL»
    return im

nuevos = {}
for i, im in enumerate(j['images']):
    if im.get('name') not in ('arm_graphics', 'mars_2020_03'): continue
    bv = j['bufferViews'][im['bufferView']]; off = bv.get('byteOffset', 0)
    pic = arreglar(im['name'], Image.open(io.BytesIO(b[off:off+bv['byteLength']])).convert('RGB'))
    out = io.BytesIO()
    if im['mimeType'] == 'image/webp': pic.save(out, 'WEBP', quality=88, method=6)
    else: pic.save(out, 'JPEG', quality=90)
    nuevos[im['bufferView']] = out.getvalue()
    print(i, im['name'], im['mimeType'], bv['byteLength'], '→', len(out.getvalue()))

# Reescribe el binario: cada bufferView en su orden, con el dato nuevo donde toca, alineado a 4 bytes
orden = sorted(range(len(j['bufferViews'])), key=lambda i: j['bufferViews'][i].get('byteOffset', 0))
fin = 0
for i in orden:                                    # ningún bufferView se solapa con otro
    v = j['bufferViews'][i]; assert v.get('byteOffset', 0) >= fin, 'bufferViews solapados'; fin = v.get('byteOffset', 0) + v['byteLength']
nb = bytearray()
for i in orden:
    v = j['bufferViews'][i]; dato = nuevos.get(i, b[v.get('byteOffset', 0):v.get('byteOffset', 0)+v['byteLength']])
    while len(nb) % 4: nb.append(0)
    v['byteOffset'] = len(nb); v['byteLength'] = len(dato); nb += dato
while len(nb) % 4: nb.append(0)
j['buffers'][0]['byteLength'] = len(nb)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(nb)
open(dst, 'wb').write(b'glTF' + struct.pack('<II', 2, total) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(nb)) + b'BIN\x00' + bytes(nb))
print('glb', len(d), '→', total)
