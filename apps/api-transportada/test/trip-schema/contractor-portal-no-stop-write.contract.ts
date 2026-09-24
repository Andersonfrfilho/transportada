/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14b: `redeliveryApplication` saiu do input de transição da tratativa — hoje ele viajava
 * na mesma chamada que o contratante dispara pelo portal, e uma linha por distração faria a decisão
 * do cliente escrever roteiro. Este contrato negativo varre `src/contractor-portal/` e prova que
 * nenhum arquivo dali **escreve** em `trip_stops`/`trip_documents` (`.update(tripStops)`,
 * `.insert(tripStops)`, `.update(tripDocuments)`, `.insert(tripDocuments)`) nem referencia
 * `redeliveryApplication` — leitura (rastreio de entrega, `stopLabel`) continua permitida; só
 * `DrizzleRedeliveryApplicationRepository` (`trips/infrastructure/`) escreve ali, e ela nunca é
 * chamada de dentro do portal.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const CONTRACTOR_PORTAL_ROOT = new URL('../../src/contractor-portal', import.meta.url)

function listSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(directory, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

const FORBIDDEN_PATTERNS = [
  /\.update\(\s*tripStops\s*\)/,
  /\.insert\(\s*tripStops\s*\)/,
  /\.update\(\s*tripDocuments\s*\)/,
  /\.insert\(\s*tripDocuments\s*\)/,
  /\bredeliveryApplication\b/,
] as const

describe('contractor-portal nunca escreve trip_stops/trip_documents (spec 164 T14b)', () => {
  const files = listSourceFiles(CONTRACTOR_PORTAL_ROOT.pathname)
  expect(files.length).toBeGreaterThan(0)

  test.each(files)(
    '%s não escreve tripStops/tripDocuments nem usa redeliveryApplication',
    (path: string) => {
      const content = readFileSync(path, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(pattern.test(content)).toBe(false)
      }
    },
  )
})
