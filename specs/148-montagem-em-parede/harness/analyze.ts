// Faltas por entrega e perfil do baú (x = comprimento, 0 = cabeceira) de um dump.
const S =
  '/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/3c7fb230-30a2-43c1-b4ea-e31f9ee9759a/scratchpad'
const dumpF = process.argv[2]!
const { file, boxes } = JSON.parse(await Bun.file(dumpF).text())
const input = JSON.parse(await Bun.file(`${S}/${file}`).text()).input
const L = +input.bedDimensions.lengthM,
  W = +input.bedDimensions.widthM,
  H = +input.bedDimensions.heightM
const req = new Map<number, number>()
for (const s of input.stops)
  req.set(
    s.sequence,
    (s.boxes ?? []).reduce((a: number, b: any) => a + b.count, 0),
  )
const placed = new Map<number, number>()
for (const b of boxes) placed.set(b.stopSequence, (placed.get(b.stopSequence) ?? 0) + 1)
const missing = [...req]
  .map(([s, n]) => [s, n - (placed.get(s) ?? 0)] as const)
  .filter(([, m]) => m > 0)
console.log('bed', L, W, H, 'missing by stop', JSON.stringify(Object.fromEntries(missing)))
// perfil: por faixa de 0.25 m em x, topo máx/min sobre a largura (amostra 5 cm), e as paradas no piso
const step = 0.25
const rows: string[] = []
for (let x0 = 0; x0 < L - 1e-9; x0 += step) {
  const tops: number[] = []
  for (let x = x0 + 0.025; x < Math.min(L, x0 + step); x += 0.05)
    for (let y = 0.025; y < W; y += 0.05) {
      let t = 0
      for (const b of boxes)
        if (x >= b.xM && x < b.xM + b.depthM && y >= b.yM && y < b.yM + b.widthM)
          t = Math.max(t, b.zM + b.heightM)
      tops.push(t)
    }
  const floorStops = new Set(
    boxes
      .filter((b: any) => b.zM < 1e-6 && b.xM < x0 + step && b.xM + b.depthM > x0)
      .map((b: any) => b.stopSequence),
  )
  const avg = tops.reduce((a, v) => a + v, 0) / tops.length
  rows.push(
    `${x0.toFixed(2)} top max ${Math.max(...tops).toFixed(2)} min ${Math.min(...tops).toFixed(2)} avg ${avg.toFixed(2)} floorStops ${[...floorStops].sort((a, b) => a - b).join(',')}`,
  )
}
console.log(rows.join('\n'))
