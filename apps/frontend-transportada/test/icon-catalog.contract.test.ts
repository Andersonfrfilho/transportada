/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O catálogo de ícones do tipo de ocorrência mora na API e o bundle não carrega código de lá.
 * Restatar a lista aqui guardaria só um lado, então ela é lida do arquivo da API (caminho
 * relativo entre apps do mesmo monorepo, num teste — não um `import`).
 */

import { describe, expect, it } from 'bun:test'

const API_CATALOG_SOURCE = new URL(
  '../../api-transportada/src/shared/trip-occurrence.constant.ts',
  import.meta.url,
)
const ICON_SOURCE = new URL('../src/components/ui/icon.tsx', import.meta.url)
const DRIVER_ICON_SOURCE = new URL(
  '../../frontend-driver/src/components/ui/icon.tsx',
  import.meta.url,
)

async function readCatalogNames(): Promise<readonly string[]> {
  const text = await Bun.file(API_CATALOG_SOURCE).text()
  const block = /export const OCCURRENCE_TYPE_ICON_NAMES = \[([^\]]*)\] as const/u.exec(text)
  if (block?.[1] === undefined) throw new Error('API_CONSTANT_NOT_FOUND_OCCURRENCE_TYPE_ICON_NAMES')
  return [...block[1].matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? '')
}

function readGlyphPaths(source: string, name: string): string | undefined {
  const declaration = new RegExp(`^\\s*'?${name}'?\\s*:\\s*\\[([\\s\\S]*?)\\],?\\s*$`, 'mu')
  const block = declaration.exec(source)
  if (block?.[1] === undefined) return undefined
  return [...block[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]).join('|')
}

describe('catálogo de ícones do tipo de ocorrência no painel', () => {
  it('tem um glyph para cada nome do catálogo da API', async () => {
    const source = await Bun.file(ICON_SOURCE).text()
    const names = await readCatalogNames()
    const missing = names.filter((name) => readGlyphPaths(source, name) === undefined)
    expect(names.length).toBeGreaterThan(0)
    expect(missing).toEqual([])
  })

  it('desenha cada glyph igual ao do motorista', async () => {
    const panelSource = await Bun.file(ICON_SOURCE).text()
    const driverSource = await Bun.file(DRIVER_ICON_SOURCE).text()
    const names = await readCatalogNames()
    const different = names.filter(
      (name) => readGlyphPaths(panelSource, name) !== readGlyphPaths(driverSource, name),
    )
    expect(different).toEqual([])
  })
})
