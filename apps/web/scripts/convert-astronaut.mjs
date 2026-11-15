/**
 * Convierte el astronauta de Sketchfab ("Astronaut", de Javi_DaviYT, CC BY 4.0) en el GLB pequeño que usa el inicio
 * de la landing (`src/features/landing/flight/data/astronaut.glb`):
 *
 *   - materiales de especular/brillo (que three.js ya no lee) a metal/rugosidad, solo con la textura de color;
 *   - texturas a JPEG de 1024 px (hace falta ImageMagick: `magick`);
 *   - solo las animaciones de caminar ("moon_walk") y de estar de pie ("idle");
 *   - vértices soldados, geometría simplificada con meshoptimizer y atributos compactos.
 *
 * De 32 MB a unos 2 MB. Uso:
 *
 *   node apps/web/scripts/convert-astronaut.mjs <original.glb> apps/web/src/features/landing/flight/data/astronaut.glb
 *
 * Script escrito con asistencia de IA (Claude Code).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { MeshoptSimplifier } = require("meshoptimizer")
await MeshoptSimplifier.ready

const [input, output] = [process.argv[2], process.argv[3]]
const tmp = mkdtempSync(join(tmpdir(), "astronaut-"))
const glb = readFileSync(input)
const jsonLength = glb.readUInt32LE(12)
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString())
const bin = glb.subarray(20 + jsonLength + 8)

const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const TYPED = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
/** Lee un accessor a un array de números (sin normalizar), respetando el salto entre elementos. */
function read(index) {
  const accessor = json.accessors[index]
  const view = json.bufferViews[accessor.bufferView]
  const Type = TYPED[accessor.componentType]
  const n = SIZE[accessor.type]
  const stride = view.byteStride || n * Type.BYTES_PER_ELEMENT
  const out = new Type(accessor.count * n)
  const data = new DataView(bin.buffer, bin.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0))
  const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[accessor.componentType]
  for (let i = 0; i < accessor.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = data[get](i * stride + k * Type.BYTES_PER_ELEMENT, true)
  return { array: out, accessor, n }
}

const chunks = []
let offset = 0
const views = []
const accessors = []
/** Añade datos al binario nuevo y devuelve el índice de su accessor. */
function write(array, type, extra = {}, target) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength)
  const pad = (4 - (offset % 4)) % 4
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad }
  const componentType = Number(Object.entries(TYPED).find(([, T]) => array instanceof T)[0])
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(extra.byteStride ? { byteStride: extra.byteStride } : {}), ...(target ? { target } : {}) })
  const { byteStride, ...rest } = extra
  accessors.push({ bufferView: views.length - 1, componentType, count: extra.count ?? array.length / SIZE[type], type, ...rest })
  delete accessors[accessors.length - 1].count_
  chunks.push(bytes)
  offset += bytes.length
  return accessors.length - 1
}

const RATIO = Number(process.env.RATIO ?? 0.35)
let before = 0, after = 0, vertsAfter = 0
for (const mesh of json.meshes) {
  for (const primitive of mesh.primitives) {
    const position = read(primitive.attributes.POSITION).array
    const normal = read(primitive.attributes.NORMAL).array
    const uv = read(primitive.attributes.TEXCOORD_0).array
    const joints = read(primitive.attributes.JOINTS_0).array
    const weights = read(primitive.attributes.WEIGHTS_0)
    let indices = Uint32Array.from(read(primitive.indices).array)
    before += indices.length / 3
    // Suelda los vértices que, sin los juegos de UV que se descartan, son el mismo: sin esto no se puede simplificar.
    {
      const seen = new Map()
      const weld = new Uint32Array(position.length / 3)
      for (let v = 0; v < weld.length; v++) {
        const key = [position[v * 3], position[v * 3 + 1], position[v * 3 + 2]].map((x) => Math.round(x * 100)).join(",") + "|" +
          [normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]].map((x) => Math.round(x * 20)).join(",") + "|" +
          Math.round(uv[v * 2] * 2048) + "," + Math.round(uv[v * 2 + 1] * 2048)
        if (!seen.has(key)) seen.set(key, v)
        weld[v] = seen.get(key)
      }
      indices = indices.map((i) => weld[i])
    }
    // Simplifica; las piezas diminutas se dejan como están.
    if (indices.length > 3000) {
      const target = Math.floor((indices.length * RATIO) / 3) * 3
      const [simplified] = MeshoptSimplifier.simplify(indices, position, 3, target, 0.02, [])
      indices = simplified
    }
    after += indices.length / 3
    // Solo los vértices que quedan en uso, renumerados.
    const remap = new Int32Array(position.length / 3).fill(-1)
    let count = 0
    for (const i of indices) if (remap[i] < 0) remap[i] = count++
    vertsAfter += count
    const P = new Float32Array(count * 3), N = new Int8Array(count * 4), U = new Float32Array(count * 2), J = new Uint8Array(count * 4), W = new Uint8Array(count * 4)
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    const wScale = weights.accessor.componentType === 5126 ? 1 : weights.accessor.componentType === 5121 ? 1 / 255 : 1 / 65535
    for (let old = 0; old < remap.length; old++) {
      const v = remap[old]
      if (v < 0) continue
      for (let k = 0; k < 3; k++) {
        const value = position[old * 3 + k]
        P[v * 3 + k] = value
        min[k] = Math.min(min[k], value); max[k] = Math.max(max[k], value)
        N[v * 4 + k] = Math.round(Math.max(-1, Math.min(1, normal[old * 3 + k])) * 127)
      }
      U[v * 2] = uv[old * 2]; U[v * 2 + 1] = uv[old * 2 + 1]
      // Pesos a bytes que sumen exactamente 255.
      const w = [0, 1, 2, 3].map((k) => weights.array[old * 4 + k] * wScale)
      const total = w.reduce((a, b) => a + b, 0) || 1
      const q = w.map((x) => Math.round((x / total) * 255))
      let biggest = 0
      for (let k = 1; k < 4; k++) if (q[k] > q[biggest]) biggest = k
      q[biggest] += 255 - q.reduce((a, b) => a + b, 0)
      for (let k = 0; k < 4; k++) { J[v * 4 + k] = q[k] ? joints[old * 4 + k] : 0; W[v * 4 + k] = q[k] }
    }
    const I = count < 65536 ? Uint16Array.from(indices, (i) => remap[i]) : Uint32Array.from(indices, (i) => remap[i])
    primitive.attributes = {
      POSITION: write(P, "VEC3", { min, max }, 34962),
      NORMAL: write(N, "VEC3", { normalized: true, byteStride: 4, count }, 34962),
      TEXCOORD_0: write(U, "VEC2", {}, 34962),
      JOINTS_0: write(J, "VEC4", {}, 34962),
      WEIGHTS_0: write(W, "VEC4", { normalized: true }, 34962),
    }
    primitive.indices = write(I, "SCALAR", {}, 34963)
  }
}

// Materiales: de especular/brillo a metal/rugosidad, solo con la textura de color.
const keepImages = new Map()
json.materials = json.materials.map((material) => {
  const old = material.extensions.KHR_materials_pbrSpecularGlossiness
  const pbr = { baseColorFactor: old.diffuseFactor, metallicFactor: 0, roughnessFactor: 0.82 }
  if (old.diffuseTexture) {
    const source = json.textures[old.diffuseTexture.index].source
    if (!keepImages.has(source)) keepImages.set(source, keepImages.size)
    pbr.baseColorTexture = { index: keepImages.get(source) }
  }
  return { name: material.name, doubleSided: material.doubleSided, pbrMetallicRoughness: pbr }
})
const images = []
for (const [source, index] of keepImages) {
  const view = json.bufferViews[json.images[source].bufferView]
  const png = `${tmp}/${index}.png`, jpg = `${tmp}/${index}.jpg`
  writeFileSync(png, bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength))
  execFileSync("magick", [png, "-background", "white", "-alpha", "remove", "-resize", "1024x1024", "-quality", "84", jpg])
  const bytes = readFileSync(jpg)
  const pad = (4 - (offset % 4)) % 4
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad }
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length })
  chunks.push(bytes); offset += bytes.length
  images[index] = { mimeType: "image/jpeg", bufferView: views.length - 1 }
}
json.images = images
json.textures = images.map((_, i) => ({ sampler: 0, source: i }))

// Animaciones: caminar y estar de pie. Sus datos se copian tal cual.
const copy = (index) => { const { array, accessor } = read(index); return write(array, accessor.type, { ...(accessor.min ? { min: accessor.min, max: accessor.max } : {}) }) }
const copied = new Map()
const once = (i) => { if (!copied.has(i)) copied.set(i, copy(i)); return copied.get(i) }
json.animations = ["moon_walk", "idle"].map((name) => {
  const animation = json.animations.find((a) => a.name === name)
  animation.samplers = animation.samplers.map((sampler) => ({ ...sampler, input: once(sampler.input), output: once(sampler.output) }))
  return animation
})
for (const skin of json.skins) skin.inverseBindMatrices = copy(skin.inverseBindMatrices)

json.accessors = accessors
json.bufferViews = views
json.extensionsUsed = ["KHR_mesh_quantization"]
json.extensionsRequired = ["KHR_mesh_quantization"]
const binOut = Buffer.concat([...chunks, Buffer.alloc((4 - (offset % 4)) % 4)])
json.buffers = [{ byteLength: binOut.length }]
let jsonOut = Buffer.from(JSON.stringify(json))
jsonOut = Buffer.concat([jsonOut, Buffer.alloc((4 - (jsonOut.length % 4)) % 4, 0x20)])
const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonOut.length + 8 + binOut.length, 8)
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]) }
writeFileSync(output, Buffer.concat([header, chunk(0x4e4f534a, jsonOut), chunk(0x004e4942, binOut)]))
rmSync(tmp, { recursive: true, force: true })
console.log(`triangles ${before} -> ${after}, vertices ${vertsAfter}, file ${(readFileSync(output).length / 1e6).toFixed(2)} MB`)
