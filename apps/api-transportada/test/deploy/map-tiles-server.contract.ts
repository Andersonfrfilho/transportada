/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const SERVER_SOURCE = new URL('../../../../deploy/map-tiles/server.ts', import.meta.url)

/**
 * Feature 089 (fase 2) — o serviço passa a servir **dois** arquivos PMTiles: o basemap
 * (`area.pmtiles`, obrigatório) e o overlay do radar (`overlay.pmtiles`, opcional). O texto é lido
 * de `server.ts`, não o processo importado: importar sobe um `Bun.serve` de verdade e exige os
 * arquivos existirem no disco — o mesmo motivo do contrato de cabeçalhos do frontend.
 */
async function readServerSource(): Promise<string> {
  return Bun.file(SERVER_SOURCE).text()
}

describe('o serviço de telhas serve dois arquivos (feature 089, fase 2)', () => {
  test('declara o caminho do basemap e do overlay do radar', async () => {
    const source = await readServerSource()
    expect(source).toContain("'/map-tiles/area.pmtiles'")
    expect(source).toContain("'/map-tiles/overlay.pmtiles'")
  })

  /**
   * ⚠️ O basemap é o que justifica o serviço existir — sem ele, é o próprio incidente que a spec
   * 083 resolveu (toda telha respondendo 404 em silêncio). Falha no boot continua sendo a decisão
   * certa só para ele.
   */
  test('a ausência do basemap ainda derruba o boot', async () => {
    const source = await readServerSource()
    expect(source).toContain('MAP_TILES_MISSING_DATASET')
    expect(source).toMatch(
      /if \(!\(await FILE\.exists\(\)\)\) \{[\s\S]*?throw new Error\('MAP_TILES_MISSING_DATASET'\)/u,
    )
  })

  /**
   * ⚠️ O overlay é acréscimo, não fundamento: instalação sem `overlay.pmtiles` (ainda não gerado,
   * ou build antigo) continua servindo o basemap normalmente. Falhar o boot por falta dele
   * derrubaria toda instalação existente por uma camada que a ADR-0044 §6 nem exige.
   */
  test('a ausência do overlay não derruba o boot', async () => {
    const source = await readServerSource()
    const overlayThrow = /OVERLAY[\s\S]{0,200}throw new Error/u.exec(source)
    expect(overlayThrow).toBeNull()
  })

  /** O overlay ausente é 404 limpo em runtime — a mesma degradação que o frontend já sabe ler. */
  test('o overlay ausente responde 404, não 500 nem corpo vazio silencioso', async () => {
    const source = await readServerSource()
    expect(source).toMatch(/OVERLAY_FILE\.exists\(\)/u)
  })

  /**
   * ⚠️ Duas faixas de bytes não podem significar duas implementações: a lógica de `Range` já
   * causou um incidente (a telha inteira em vez de 206) quando existia só uma vez. Um segundo
   * arquivo pede o **mesmo** caminho parametrizado, nunca uma cópia colada da função.
   */
  test('a resposta por faixa de bytes é uma função só, parametrizada pelo arquivo', async () => {
    const source = await readServerSource()
    const definitions = source.match(/function rangeResponse\(/gu) ?? []
    expect(definitions).toHaveLength(1)
    expect(source).toMatch(/function rangeResponse\([^)]*file: BunFile/u)
  })

  test('caminho desconhecido continua 404', async () => {
    const source = await readServerSource()
    expect(source).toContain('status: 404')
  })
})
