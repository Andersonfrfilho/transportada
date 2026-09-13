// Fração de apoio de cada caixa no layout (área da base encostada em topo de caixa a <=1 mm, ou piso).
const [outF] = process.argv.slice(2)
const { boxes } = JSON.parse(await Bun.file(outF!).text())
const C = 0.005
const bins: Record<string, number> = {}
let under80 = 0,
  minF = 1
for (const b of boxes) {
  if (b.zM < 1e-6) {
    bins['1.00'] = (bins['1.00'] ?? 0) + 1
    continue
  }
  const nx = Math.max(1, Math.round(b.depthM / C)),
    ny = Math.max(1, Math.round(b.widthM / C))
  let sup = 0
  const under = boxes.filter(
    (o: any) =>
      Math.abs(o.zM + o.heightM - b.zM) < 0.001 &&
      o.xM < b.xM + b.depthM &&
      b.xM < o.xM + o.depthM &&
      o.yM < b.yM + b.widthM &&
      b.yM < o.yM + o.widthM,
  )
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x = b.xM + (i + 0.5) * C,
        y = b.yM + (j + 0.5) * C
      if (
        under.some((o: any) => x >= o.xM && x < o.xM + o.depthM && y >= o.yM && y < o.yM + o.widthM)
      )
        sup++
    }
  const f = sup / (nx * ny)
  minF = Math.min(minF, f)
  if (f < 0.8 - 1e-3) under80++
  const k =
    f >= 0.999
      ? '1.00'
      : f >= 0.8
        ? '0.80-1'
        : f >= 0.7
          ? '0.70-0.80'
          : f >= 0.6
            ? '0.60-0.70'
            : f >= 0.5
              ? '0.50-0.60'
              : '<0.50'
  bins[k] = (bins[k] ?? 0) + 1
}
console.log(
  outF,
  JSON.stringify({ boxes: boxes.length, under80, minFraction: +minF.toFixed(3), bins }),
)
