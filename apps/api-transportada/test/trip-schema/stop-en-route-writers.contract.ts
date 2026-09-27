/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 D4: "toda escrita de `arrived_at` ou `completed_at` zera `en_route_since` e
 * `en_route_tapped_at` no mesmo `UPDATE`" — o `trip_stops_en_route_open_check` não deixa ser de
 * outro jeito, e sem isto o motorista fica preso, sem conseguir iniciar nenhuma parada até o fim da
 * viagem (não existe mais troca, Revisão 2). Contrato estático, no molde de
 * `trip-status-writers.contract.ts` — a garantia de cada escritor é o teste de integração dele.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const SOURCE_ROOT = new URL('../../src', import.meta.url)

/**
 * Ancorada em `.where(` (convenção do repositório: todo `update().set()` encadeia `.where()` logo
 * depois) — sem isso, um `${...}` de `sql` template dentro do `set` (ex.: `coalesce(${x}, ${y})`)
 * tem `}` seguido de `)`, e um não-greedy simples fecha o casamento cedo demais, cortando o resto
 * das chaves do objeto antes de elas aparecerem.
 */
const UPDATE_TRIP_STOPS_OBJECT_SET_PATTERN =
  /\.update\(tripStops\)\s*\.set\(\{([\s\S]*?)\}\)\s*\.where\(/g
const ARRIVED_OR_COMPLETED_KEY_PATTERN = /\b(arrivedAt|completedAt)\s*:/
const EN_ROUTE_SINCE_PATTERN = /\benRouteSince\s*:\s*null\b/
const EN_ROUTE_TAPPED_AT_PATTERN = /\benRouteTappedAt\s*:\s*null\b/

function listSourceFiles(directory: string): readonly string[] {
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

type FileFinding = {
  readonly missesEnRouteClear: boolean
  readonly path: string
}

function inspectFile(path: string, content: string): FileFinding {
  const objectSetMatches = [...content.matchAll(UPDATE_TRIP_STOPS_OBJECT_SET_PATTERN)]
  const missesEnRouteClear = objectSetMatches.some((match) => {
    const body = match[1] ?? ''
    if (!ARRIVED_OR_COMPLETED_KEY_PATTERN.test(body)) return false

    return !(EN_ROUTE_SINCE_PATTERN.test(body) && EN_ROUTE_TAPPED_AT_PATTERN.test(body))
  })

  return { missesEnRouteClear, path }
}

describe('escritores de trip_stops.arrived_at/completed_at zeram "a caminho" (D4)', () => {
  const findings = listSourceFiles(SOURCE_ROOT.pathname).map((path) =>
    inspectFile(path, readFileSync(path, 'utf8')),
  )

  test('todo `.update(tripStops)` que grave arrivedAt ou completedAt zera enRouteSince e enRouteTappedAt', () => {
    const offenders = findings.filter((finding) => finding.missesEnRouteClear).map((f) => f.path)

    expect(offenders).toEqual([])
  })
})
