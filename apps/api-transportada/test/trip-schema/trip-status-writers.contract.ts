/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §2: "todo arquivo de `src/` que contenha `.update(trips)` com a chave `status` no `set`
 * tem de importar e chamar `recordTripStatusChange`; `set` montado com spread ou `sql` sobre `trips`
 * é proibido nesses arquivos." Este contrato é a rede — varre o texto do repositório; a garantia de
 * cada escritor é o teste de integração dele (T3, `test/integration/*.integration.ts`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const SOURCE_ROOT = new URL('../../src', import.meta.url)

const UPDATE_TRIPS_OBJECT_SET_PATTERN = /\.update\(trips\)\s*\.set\(\{([\s\S]*?)\}\)/g
const UPDATE_TRIPS_RAW_SET_PATTERN = /\.update\(trips\)\s*\.set\(\s*sql/g
const STATUS_KEY_PATTERN = /\bstatus\s*[:,}]/

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
  readonly path: string
  readonly setsStatusWithoutRecorder: boolean
  readonly usesRawSqlSet: boolean
  readonly usesSpreadInStatusSet: boolean
}

function inspectFile(path: string, content: string): FileFinding {
  const objectSetMatches = [...content.matchAll(UPDATE_TRIPS_OBJECT_SET_PATTERN)]
  const setsStatus = objectSetMatches.some((match) => STATUS_KEY_PATTERN.test(match[1] ?? ''))
  const usesSpreadInStatusSet = objectSetMatches.some(
    (match) => STATUS_KEY_PATTERN.test(match[1] ?? '') && (match[1] ?? '').includes('...'),
  )
  const usesRawSqlSet = UPDATE_TRIPS_RAW_SET_PATTERN.test(content)
  const callsRecorder = content.includes('recordTripStatusChange')

  return {
    path,
    setsStatusWithoutRecorder: setsStatus && !callsRecorder,
    usesRawSqlSet,
    usesSpreadInStatusSet,
  }
}

describe('escritores de trips.status gravam trip_status_events (ADR-0068 §2)', () => {
  const findings = listSourceFiles(SOURCE_ROOT.pathname)
    .filter((path) => !path.endsWith('trip-status-event.persistence.ts'))
    .map((path) => inspectFile(path, readFileSync(path, 'utf8')))

  test('todo arquivo com `.update(trips)` mudando `status` chama recordTripStatusChange', () => {
    const offenders = findings
      .filter((finding) => finding.setsStatusWithoutRecorder)
      .map((finding) => finding.path)

    expect(offenders).toEqual([])
  })

  test('nenhum arquivo monta o `set` de trips com spread quando muda status', () => {
    const offenders = findings
      .filter((finding) => finding.usesSpreadInStatusSet)
      .map((finding) => finding.path)

    expect(offenders).toEqual([])
  })

  test('nenhum arquivo grava trips por `sql` bruto no `set`', () => {
    const offenders = findings
      .filter((finding) => finding.usesRawSqlSet)
      .map((finding) => finding.path)

    expect(offenders).toEqual([])
  })
})
