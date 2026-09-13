// D23: audita TODA caixa colocada (recomendado + complemento). Pilha alta = topo (do piso) acima de 3 × a menor
// base da caixa. Ela precisa de escora até `restraint = max(0, min(z, topo − 3b))`:
//   modo E → cabeceira (x = 0) E pelo menos uma lateral (y = 0 ou y = W); a porta (x = L) nunca é exigida;
//   modo 0 → os quatro lados, com a porta sem valer como parede.
// Escora num ponto da face = parede a menos de 3b/√10 (giro da pilha), ou caixa vizinha que cobre o ponto, fica
// do lado de fora da face a menos de 3b/√10, tem topo ≥ restraint e começa abaixo do topo da candidata − 1 cm
// (spec 142: sobe ao lado dela). O lado vale se 80% dos pontos (passo de 5 mm) estão escorados (spec 146 D1);
// a porta e a borda < 25 cm exigem todos. FRAC=1 audita pela regra antiga (borda inteira).
const S =
  '/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/3c7fb230-30a2-43c1-b4ea-e31f9ee9759a/scratchpad'
const STEP = 0.005
const TOL = 1e-3
const FRAC = Number(process.env.FRAC ?? 0.8)
type B = { xM: number; yM: number; zM: number; depthM: number; widthM: number; heightM: number }
let failedAny = false
for (const dumpF of process.argv.slice(2)) {
  const mode = dumpF.match(/_([SE0-9])\.json$/)?.[1] ?? '0'
  const { file, boxes } = JSON.parse(await Bun.file(dumpF).text()) as { file: string; boxes: B[] }
  const bed = JSON.parse(await Bun.file(`${S}/${file}`).text()).input.bedDimensions
  const L = +bed.lengthM,
    W = +bed.widthM
  let tall = 0
  const violations: Record<string, number> = {}
  for (const b of boxes) {
    const base = Math.min(b.depthM, b.widthM)
    const top = b.zM + b.heightM
    if (top <= base * 3 + 1e-9) continue
    tall++
    if (mode === 'S' || mode === '1') continue
    const restraint = Math.max(0, Math.min(b.zM, top - base * 3))
    const catchGap = (base * 3) / Math.hypot(3, 1)
    const near = boxes.filter(
      (o) =>
        o !== b &&
        o.zM < top - 0.01 + 1e-9 &&
        o.zM + o.heightM >= restraint - 1e-9 &&
        o.xM < b.xM + b.depthM + catchGap &&
        o.xM + o.depthM > b.xM - catchGap &&
        o.yM < b.yM + b.widthM + catchGap &&
        o.yM + o.widthM > b.yM - catchGap &&
        !(
          o.xM < b.xM + b.depthM - TOL &&
          b.xM < o.xM + o.depthM - TOL &&
          o.yM < b.yM + b.widthM - TOL &&
          b.yM < o.yM + o.widthM - TOL
        ),
    )
    // side: axis 'x' faces (headboard = back, door = front) or 'y' faces (left = back, right = front)
    const holds = (axis: 'x' | 'y', front: boolean, wallCounts: boolean): boolean => {
      const face = axis === 'x' ? (front ? b.xM + b.depthM : b.xM) : front ? b.yM + b.widthM : b.yM
      const wallGap = axis === 'x' ? (front ? L - face : face) : front ? W - face : face
      if (wallCounts && wallGap < catchGap - 1e-9) return true
      const from = axis === 'x' ? b.yM : b.xM
      const size = axis === 'x' ? b.widthM : b.depthM
      const n = Math.max(1, Math.round(size / STEP))
      // D1 (spec 146): porta e borda < 25 cm exigem tudo; os outros lados, 80% dos pontos. FRAC=1 volta à regra antiga.
      const isDoor = axis === 'x' && front
      if (!isDoor && size >= 0.25 - TOL && FRAC < 1) {
        // Comprimento exato coberto (união de intervalos), não amostra: a amostra erra um passo na fronteira dos 80%.
        const spans = near
          .map((o) => {
            const [oFrom, oSize, oNear, oFar] =
              axis === 'x'
                ? [o.yM, o.widthM, o.xM, o.xM + o.depthM]
                : [o.xM, o.depthM, o.yM, o.yM + o.widthM]
            const gap = front ? oNear - face : face - oFar
            return gap > -TOL && gap < catchGap - 1e-9
              ? [Math.max(from, oFrom), Math.min(from + size, oFrom + oSize)]
              : null
          })
          .filter((s): s is number[] => s !== null && s[1]! > s[0]!)
          .sort((a, c) => a[0]! - c[0]!)
        let covered = 0,
          reached = from
        for (const [a, c] of spans) {
          if (c! <= reached) continue
          covered += c! - Math.max(a!, reached)
          reached = c!
        }
        return size - covered <= size * (1 - FRAC) + TOL
      }
      const allowed = 0
      let loose = 0
      for (let i = 0; i < n; i++) {
        const p = from + (i + 0.5) * (size / n)
        const ok = near.some((o) => {
          const [oFrom, oSize, oNear, oFar] =
            axis === 'x'
              ? [o.yM, o.widthM, o.xM, o.xM + o.depthM]
              : [o.xM, o.depthM, o.yM, o.yM + o.widthM]
          if (p < oFrom || p >= oFrom + oSize) return false
          const gap = front ? oNear - face : face - oFar
          return gap > -TOL && gap < catchGap - 1e-9
        })
        if (!ok && ++loose > allowed) return false
      }
      return true
    }
    const head = holds('x', false, true)
    const left = holds('y', false, true)
    const right = holds('y', true, true)
    let bad: string | null = null
    if (mode === 'E') {
      if (!head) bad = 'noHeadboard'
      else if (!left && !right) bad = 'noLateral'
    } else if (!head || !left || !right || !holds('x', true, false)) bad = 'notConfined'
    if (bad) violations[bad] = (violations[bad] ?? 0) + 1
    if (bad && process.env.DEBUG)
      console.log(
        bad,
        JSON.stringify(b),
        'near',
        JSON.stringify(near.map((o) => [o.xM, o.yM, o.zM, o.depthM, o.widthM, o.heightM])),
      )
  }
  const count = Object.values(violations).reduce((a, v) => a + v, 0)
  if (count > 0 && mode !== 'S' && mode !== '1') failedAny = true
  console.log(
    dumpF.split('/').pop(),
    JSON.stringify({ mode, boxes: boxes.length, tall, violations: count, byKind: violations }),
  )
}
if (failedAny) console.log('REPROVADO: há pilha alta sem escora')
