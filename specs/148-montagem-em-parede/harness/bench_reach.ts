const S =
  '/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/3c7fb230-30a2-43c1-b4ea-e31f9ee9759a/scratchpad'
const PKG =
  process.env.PKG ??
  '/Users/anderson.filho/Documents/personal/adatechnology-packages-wt/cargo-placement/packages/backend/cargo-placement'
const TAG = process.env.TAG ?? 'reach'
const ONLY = process.env.ONLY?.split(',')
const REACHES = (process.env.REACHES ?? '0.6,1.2,2,3,null')
  .split(',')
  .map((r) => (r === 'null' ? null : Number(r)))
const EXTRA = JSON.parse(process.env.EXTRA ?? '{}')
const cases = [
  ['fiorino', '43f0218a-a60e-4fc5-a239-dbc4bf1be292.json'],
  ['sprinter', 'd665c086-7747-44c9-8e9e-480e5a3e4888.json'],
  ['iveco', 'ce9bd380-e279-4bf2-89ab-016b72cac26f.json'],
  ['accelo', 'c5be7eaa-e4bf-408d-a7d2-7b182c0b5797.json'],
  ['p27', '6b676625.json'],
  ['atego', '768f475f-781f-4451-9f9e-a7d75d9401c1.json'],
] as const
const mod = await import(`${PKG}/src/index.ts`)
const { simulateUnloading } = await import(`${PKG}/test/cargo-placement/unloading-simulation.ts`)
for (const [name, file] of cases) {
  if (ONLY && !ONLY.includes(name)) continue
  const { input } = JSON.parse(await Bun.file(`${S}/${file}`).text())
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
      `${S}/dumps/${TAG}_${name}_r${reach}_E.json`,
      JSON.stringify({ file, boxes, unplaced: out.placement.unplaced }),
    )
  }
}
