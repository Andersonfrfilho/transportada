// Entradas em ./inputs, dumps em $OUT (padrão ./dumps, fora do git). PKG: pasta do pacote; importa o fonte (src/).
const INPUTS = `${import.meta.dir}/inputs`
const OUT = process.env.OUT ?? `${import.meta.dir}/dumps`
const PKG =
  process.env.PKG ??
  `${process.env.HOME}/Documents/personal/adatechnology-packages-wt/cargo-placement/packages/backend/cargo-placement`
const TAG = process.env.TAG ?? 'reach'
const ONLY = process.env.ONLY?.split(',')
const REACHES = (process.env.REACHES ?? '2')
  .split(',')
  .map((r) => (r === 'null' ? null : Number(r)))
const EXTRA = JSON.parse(process.env.EXTRA ?? '{}')
const cases = [
  'fiorino',
  'sprinter',
  'iveco-antiga',
  'accelo',
  'iveco-27-paradas',
  'atego-84-paradas',
] as const
const mod = await import(`${PKG}/src/index.ts`)
const { simulateUnloading } = await import(`${PKG}/test/cargo-placement/unloading-simulation.ts`)
for (const name of cases) {
  if (ONLY && !ONLY.includes(name)) continue
  const file = `${name}.json`
  const raw = JSON.parse(await Bun.file(`${INPUTS}/${file}`).text())
  const input = raw.input ?? raw
  const bed = {
    heightM: +input.bedDimensions.heightM,
    lengthM: +input.bedDimensions.lengthM,
    widthM: +input.bedDimensions.widthM,
  }
  for (const reach of REACHES) {
    const { securesCargo: _s, enclosedBody: _e, ...rest } = input
    const t0 = performance.now()
    const out = mod.resolveCargoLayout({
      ...rest,
      enclosedBody: true,
      securesCargo: false,
      deliveryReachM: reach,
      ...EXTRA,
      deadline: Date.now() + 3_600_000,
    })
    const ms = Math.round(performance.now() - t0)
    const boxes = out.placement.layers.flatMap((l: any) => l.boxes)
    const rehandling = boxes.filter((b: any) => b.reasons.includes('needsRehandling')).length
    const outOfReach = boxes.filter((b: any) => b.reasons.includes('outOfReach')).length
    const fora = out.placement.unplaced.reduce((t: number, u: any) => t + u.count, 0)
    const sim = simulateUnloading(out.placement, bed)
    const stuckBoxes = sim.stuck.reduce((t: number, s: any) => t + s.count, 0)
    console.log(
      JSON.stringify({
        tag: TAG,
        name,
        reach,
        ms,
        placed: boxes.length,
        fora,
        rehandling,
        outOfReach,
        stuckAt06: stuckBoxes,
        stuckStops: sim.stuck.length,
        unsupported: sim.unsupported.length,
        arr: out.stopArrangement,
      }),
    )
    await Bun.write(
      `${OUT}/${TAG}_${name}_r${reach}_E.json`,
      JSON.stringify({ file, boxes, unplaced: out.placement.unplaced }),
    )
  }
}
