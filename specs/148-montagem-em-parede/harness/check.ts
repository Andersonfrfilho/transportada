// Para cada dump: apoio (mesma conta de support.ts), fora do baú e colisão entre caixas.
const S =
  '/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/3c7fb230-30a2-43c1-b4ea-e31f9ee9759a/scratchpad'
const C = 0.005
const T = 1e-3
for (const dumpF of process.argv.slice(2)) {
  const { file, boxes } = JSON.parse(await Bun.file(dumpF).text())
  const bed = JSON.parse(await Bun.file(`${S}/${file}`).text()).input.bedDimensions
  const L = +bed.lengthM,
    W = +bed.widthM,
    H = +bed.heightM
  let under80 = 0,
    minF = 1,
    outside = 0,
    collisions = 0
  for (const b of boxes) {
    if (
      b.xM < -T ||
      b.yM < -T ||
      b.zM < -T ||
      b.xM + b.depthM > L + T ||
      b.yM + b.widthM > W + T ||
      b.zM + b.heightM > H + T
    )
      outside++
    if (b.zM < 1e-6) continue
    const nx = Math.max(1, Math.round(b.depthM / C)),
      ny = Math.max(1, Math.round(b.widthM / C))
    const under = boxes.filter(
      (o: any) =>
        Math.abs(o.zM + o.heightM - b.zM) < 0.001 &&
        o.xM < b.xM + b.depthM &&
        b.xM < o.xM + o.depthM &&
        o.yM < b.yM + b.widthM &&
        b.yM < o.yM + o.widthM,
    )
    let sup = 0
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        const x = b.xM + (i + 0.5) * C,
          y = b.yM + (j + 0.5) * C
        if (
          under.some(
            (o: any) => x >= o.xM && x < o.xM + o.depthM && y >= o.yM && y < o.yM + o.widthM,
          )
        )
          sup++
      }
    const f = sup / (nx * ny)
    minF = Math.min(minF, f)
    if (f < 0.8 - 1e-3) under80++
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j]
      const ox = Math.min(a.xM + a.depthM, b.xM + b.depthM) - Math.max(a.xM, b.xM)
      const oy = Math.min(a.yM + a.widthM, b.yM + b.widthM) - Math.max(a.yM, b.yM)
      const oz = Math.min(a.zM + a.heightM, b.zM + b.heightM) - Math.max(a.zM, b.zM)
      if (ox > T && oy > T && oz > T) collisions++
    }
  console.log(
    dumpF.split('/').pop(),
    JSON.stringify({
      boxes: boxes.length,
      under80,
      minFraction: +minF.toFixed(3),
      outside,
      collisions,
    }),
  )
}
