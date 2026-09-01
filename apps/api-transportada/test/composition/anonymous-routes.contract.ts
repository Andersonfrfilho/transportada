/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `main.ts` monta as rotas anônimas em **dois** ramos: um para instalação sem `companyId` — que
 * publica só o que não depende de empresa — e o normal. Os dois são listas de spread escritas à
 * mão, e nada obrigava a concordarem.
 *
 * O defeito que isto pega aconteceu: a rota pública de anexo entrou **só no ramo degradado**, os
 * testes de rota passaram (eles exercitam a fábrica, não a composição), o deploy fechou verde, e em
 * staging — que tem `companyId` — a rota respondia como caminho inexistente.
 *
 * O invariante é o que o desenho já promete: o ramo sem empresa oferece **menos** rotas, nunca
 * outras. Toda rota dele tem de existir no normal.
 */
import { describe, expect, test } from 'bun:test'

const MAIN_PATH = new URL('../../src/main.ts', import.meta.url)

/** Os dois `return [...]` de rota anônima, na ordem em que aparecem. */
function readAnonymousRouteBranches(source: string): readonly (readonly string[])[] {
  const marker = 'if (config.companyId === undefined) {'
  const start = source.indexOf(marker)
  if (start < 0) throw new Error('ramo sem companyId não encontrado em main.ts')

  // Os dois blocos fecham com indentação diferente, então o fim é "linha que só tem `]`" — procurar
  // um recuo fixo faz o primeiro bloco engolir o segundo, e o contrato passa a comparar lixo.
  const branches = [...source.slice(start).matchAll(/return \[([\s\S]*?)\n\s*\]/gu)]
    .slice(0, 2)
    .map((match) =>
      [...(match[1] ?? '').matchAll(/\.\.\.([A-Za-z]+),/gu)].map((m) => m[1] as string),
    )

  if (branches.length < 2) throw new Error('esperava dois ramos de rota anônima em main.ts')
  return branches
}

describe('composição das rotas anônimas', () => {
  test('o ramo sem empresa não oferece rota que o normal não tenha', async () => {
    const source = await Bun.file(MAIN_PATH).text()
    const [degraded = [], normal = []] = readAnonymousRouteBranches(source)

    expect(degraded.length).toBeGreaterThan(0)
    expect(normal.length).toBeGreaterThan(0)
    expect(degraded.filter((route) => !normal.includes(route))).toEqual([])
  })
})
