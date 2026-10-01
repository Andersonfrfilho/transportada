/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const SRC = new URL('../../src/', import.meta.url)

/**
 * Spec 153 RF11 / aceite 4: o produto tem um mapa só, o MapLibre. Este contrato varre `src/`
 * inteiro (não uma lista de arquivos escolhida à mão) para que reintroduzir o desenho antigo, por
 * qualquer caminho, quebre o build antes de chegar em produção.
 */
const FORBIDDEN_PATTERNS: readonly Readonly<{ label: string; pattern: RegExp }>[] = [
  { label: 'VectorMap', pattern: /\bVectorMap\b/u },
  { label: 'tripRouteMap.service', pattern: /tripRouteMap\.service/u },
  { label: 'tripBasemap.service', pattern: /tripBasemap\.service/u },
  { label: 'tileMap.service', pattern: /tileMap\.service/u },
  { label: 'resolveRouteTraceSegments', pattern: /\bresolveRouteTraceSegments\b/u },
]

async function sourceFiles(directory: URL): Promise<readonly URL[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: URL[] = []
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(entryUrl)))
      continue
    }
    if (/\.(?:ts|tsx|css)$/u.test(entry.name)) files.push(entryUrl)
  }
  return files
}

describe('contrato de fonte — mapa antigo removido (spec 153 RF11, aceite 4)', () => {
  test('nenhum arquivo de src/ importa ou referencia VectorMap, tripRouteMap.service, tripBasemap.service, tileMap.service ou resolveRouteTraceSegments', async () => {
    const files = await sourceFiles(SRC)
    const offenders: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${file.pathname} → ${label}`)
      }
    }

    expect(offenders).toEqual([])
  })

  test('os arquivos do desenho antigo não existem mais em src/', async () => {
    const files = await sourceFiles(SRC)
    const paths = files.map((file) => file.pathname)

    expect(paths.some((path) => path.endsWith('/components/ui/vector-map.tsx'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/components/ui/vector-map.module.css'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/trip/shared/tripRouteMap.service.ts'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/trip/shared/tripBasemap.service.ts'))).toBe(false)
    expect(paths.some((path) => path.endsWith('/trip/shared/tileMap.service.ts'))).toBe(false)
  })
})
