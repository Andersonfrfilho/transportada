// Diagnóstico geométrico independente: para cada caixa que falta, procura no relevo FINAL (dump)
// uma posição em que ela cabe, e classifica pelo primeiro critério que barra.
const [inF, outF] = process.argv.slice(2)
const { input } = JSON.parse(await Bun.file(inF!).text())
const { boxes } = JSON.parse(await Bun.file(outF!).text())
const bed = input.bedDimensions
const H = +bed.heightM,
  L = +bed.lengthM,
  W = +bed.widthM
const C = 0.01 // célula 1 cm
const NX = Math.round(L / C),
  NY = Math.round(W / C)
const top = new Float64Array(NX * NY),
  seq = new Int32Array(NX * NY),
  comp = new Uint8Array(NX * NY)
const isComp = (b: any) =>
  b.reasons.some((r: string) => r === 'outOfReach' || r === 'needsRehandling')
for (const b of [...boxes].sort((a: any, c: any) => a.zM + a.heightM - (c.zM + c.heightM))) {
  const x0 = Math.round(b.xM / C),
    x1 = Math.round((b.xM + b.depthM) / C),
    y0 = Math.round(b.yM / C),
    y1 = Math.round((b.yM + b.widthM) / C)
  const t = b.zM + b.heightM
  for (let i = x0; i < x1; i++)
    for (let j = y0; j < y1; j++) {
      const k = i * NY + j
      if (t > top[k]!) {
        top[k] = t
        seq[k] = b.stopSequence
        comp[k] = isComp(b) ? 1 : 0
      }
    }
}
// free volume & floor
let freeV = 0,
  freeFloor = 0
for (let k = 0; k < top.length; k++) {
  freeV += (H - top[k]!) * C * C
  if (top[k]! < 1e-9) freeFloor += C * C
}
const hist: Record<string, number> = {}
for (let k = 0; k < top.length; k++) {
  const f = H - top[k]!
  const key = f >= 0.8 ? '>=0.80' : f >= 0.4 ? '0.40-0.80' : f >= 0.2 ? '0.20-0.40' : '<0.20'
  hist[key] = (hist[key] ?? 0) + C * C
}
console.log(
  'freeV m3',
  freeV.toFixed(2),
  'freeFloor m2',
  freeFloor.toFixed(2),
  'area by free height m2',
  JSON.stringify(Object.fromEntries(Object.entries(hist).map(([k, v]) => [k, +v.toFixed(2)]))),
)
// free height per 0.5 m along length (min/mean)
const prof: string[] = []
for (let x = 0; x < NX; x += 50) {
  let s = 0,
    n = 0,
    mx = 0
  for (let i = x; i < Math.min(NX, x + 50); i++)
    for (let j = 0; j < NY; j++) {
      s += top[i * NY + j]!
      n++
      mx = Math.max(mx, top[i * NY + j]!)
    }
  prof.push(`${(x * C).toFixed(1)}:${(s / n).toFixed(2)}/${mx.toFixed(2)}`)
}
console.log('mean/max top per 0.5m (x=0 testeira, x=L porta):', prof.join(' '))
// missing
const placedK = new Map<string, number>()
for (const b of boxes)
  placedK.set(
    b.label + '|' + b.stopSequence,
    (placedK.get(b.label + '|' + b.stopSequence) ?? 0) + 1,
  )
const missing: any[] = []
for (const s of input.stops) {
  const m = new Map<string, any>()
  for (const b of s.boxes ?? []) {
    const e = m.get(b.label) ?? { ...b, count: 0, seq: s.sequence }
    e.count += b.count
    m.set(b.label, e)
  }
  for (const [k, e] of m) {
    const d = e.count - (placedK.get(k + '|' + s.sequence) ?? 0)
    if (d > 0) missing.push({ ...e, miss: d })
  }
}
console.log(
  'missing',
  missing.reduce((a, r) => a + r.miss, 0),
  'rows',
  JSON.stringify(
    missing.map((r) => [
      r.seq,
      r.miss,
      `${r.lengthMm}x${r.widthMm}x${r.heightMm}`,
      r.isStackable,
      r.isFragile,
      r.keepUpright,
    ]),
  ),
)
// search
function search(dx: number, dy: number, h: number, k: number) {
  const nx = Math.round(dx / C),
    ny = Math.round(dy / C)
  const res = { phys: 0, physOrder: 0, physOrderReach: 0, physOrderFloor: 0, best: null as any }
  for (let i = 0; i + nx <= NX; i += 2)
    for (let j = 0; j + ny <= NY; j += 2) {
      let base = 0
      for (let a = i; a < i + nx && base + h <= H + 1e-9; a++)
        for (let b = j; b < j + ny; b++) {
          const t = top[a * NY + b]!
          if (t > base) base = t
        }
      if (base + h > H + 1e-9) continue
      let sup = 0,
        orderOk = true
      for (let a = i; a < i + nx; a++)
        for (let b = j; b < j + ny; b++) {
          const kk = a * NY + b
          if (top[kk]! >= base - 0.005) {
            sup++
            if (base > 1e-9 && !(seq[kk]! > k || (comp[kk] === 1 && seq[kk]! >= k))) orderOk = false
          }
        }
      if (sup < Number(process.env.SUPF ?? 0.8) * nx * ny) continue
      res.phys++
      if (!orderOk) continue
      res.physOrder++
      if (base < 1e-9) res.physOrderFloor++
      // alcance: face do lado da porta (x+dx) a <=0.6 m do fim da carga no piso à frente ... aproximação: carga à frente (x > face) mais alta que a base?
      let blocked = false
      for (let a = i + nx; a < NX && !blocked; a++)
        for (let b = j; b < j + ny; b++)
          if (top[a * NY + b]! > base + 1e-9 && seq[a * NY + b]! < k) {
            blocked = true
            break
          }
      if (!blocked) {
        res.physOrderReach++
        if (!res.best || base < res.best.z)
          res.best = { x: +(i * C).toFixed(2), y: +(j * C).toFixed(2), z: +base.toFixed(2) }
      }
    }
  return res
}
for (const r of missing) {
  const dims = [r.lengthMm / 1000, r.widthMm / 1000]
  const h = r.heightMm / 1000
  const a = search(dims[0]!, dims[1]!, h, r.seq),
    b = search(dims[1]!, dims[0]!, h, r.seq)
  console.log(
    `seq ${r.seq} x${r.miss} ${r.lengthMm}x${r.widthMm}x${r.heightMm}`,
    JSON.stringify({
      phys: a.phys + b.phys,
      physOrder: a.physOrder + b.physOrder,
      physOrderFloor: a.physOrderFloor + b.physOrderFloor,
      notBehindEarlier: a.physOrderReach + b.physOrderReach,
      best: a.best ?? b.best,
    }),
  )
}
