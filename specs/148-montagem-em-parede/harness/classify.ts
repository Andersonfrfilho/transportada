// Lê a saída do diag.ts (stdin) e classifica cada caixa que falta pela primeira regra que barra.
const text = await new Response(Bun.stdin.stream()).text()
const tally: Record<string, number> = {}
for (const line of text.split('\n')) {
  const m = line.match(/^seq (\d+) x(\d+) (\d+)x(\d+)x(\d+) (\{.*\})$/)
  if (!m) continue
  const [, , k, l, w, h, js] = m
  const r = JSON.parse(js!)
  const count = +k!,
    base = Math.min(+l!, +w!) / 1000,
    height = +h! / 1000
  let cls: string
  if (r.phys === 0) cls = 'semAssentoApoio80'
  else if (r.physOrder === 0) cls = 'soSobreEntregaAnterior'
  else if (r.best && r.best.z + height > 3 * base + 1e-9) cls = 'pilhaAltaD23'
  else cls = 'outro'
  tally[cls] = (tally[cls] ?? 0) + count
}
console.log(JSON.stringify(tally))
