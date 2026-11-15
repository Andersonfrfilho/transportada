/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 T2 (achado da T0): o painel descarta em silêncio o `kind` da linha do tempo que não conhece
 * (`KNOWN_EVENT_KINDS`, spec 266 T1.2). Foi assim que o aviso no grupo da contratante (`contractor.group.whatsapp`, 318)
 * sumiu da tela sem erro nenhum. Este contrato compara as duas listas nos dois sentidos: todo `kind` que a API manda o
 * painel conhece, e todo `kind` que o painel lista a API ainda manda. Sem duplicidade em nenhuma das duas.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_TIMELINE_EVENT_KINDS } from '../../src/trips/domain/occurrence-timeline.policy.js'

const PANEL_VALIDATION = new URL(
  '../../../frontend-transportada/src/modules/trip/shared/tripOccurrenceTimeline.validation.ts',
  import.meta.url,
)

async function panelKinds(): Promise<readonly string[]> {
  const source = (await readFile(PANEL_VALIDATION, 'utf8')).replaceAll(/^\s*\/\/.*$/gmu, '')
  const match = /const KNOWN_EVENT_KINDS[^=]*=\s*\[([^\]]*)\]/u.exec(source)
  if (match?.[1] === undefined) throw new Error('KNOWN_EVENT_KINDS not found in the panel')
  return [...match[1].matchAll(/'([^']+)'/gu)].map((value) => value[1] ?? '')
}

function duplicates(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.indexOf(value) !== index)
}

describe('os tipos da linha do tempo da ocorrência: API e painel (spec 324 T2)', () => {
  test('todo kind que a API manda o painel conhece', async () => {
    const known = new Set(await panelKinds())
    expect(OCCURRENCE_TIMELINE_EVENT_KINDS.filter((kind) => !known.has(kind))).toEqual([])
  })

  test('todo kind que o painel lista a API ainda manda', async () => {
    const sent = new Set<string>(OCCURRENCE_TIMELINE_EVENT_KINDS)
    expect((await panelKinds()).filter((kind) => !sent.has(kind))).toEqual([])
  })

  test('nenhuma das duas listas repete um kind', async () => {
    expect(duplicates(OCCURRENCE_TIMELINE_EVENT_KINDS)).toEqual([])
    expect(duplicates(await panelKinds())).toEqual([])
  })
})
