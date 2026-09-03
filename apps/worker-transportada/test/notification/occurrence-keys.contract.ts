/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 D8: paridade das chaves de ocorrência de parada com o catálogo da API.
 *
 * Quem dispara é a API, pelo trilho `notification.v1`; este worker renderiza o template semeado
 * no banco. A verdade é o catálogo da API — este contrato o **lê pelo caminho relativo** (mesmo
 * padrão do preview do frontend) em vez de comparar literal com literal, que passaria com os dois
 * lados errados juntos.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import {
  TRIP_OCCURRENCE_TEMPLATE_KEY,
  TRIP_OCCURRENCE_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification/notification.constant.js'

const API_CATALOG_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
      import.meta.url,
    ),
  ),
  'utf8',
)

function apiOccurrenceKeys(): readonly string[] {
  const matches = [...API_CATALOG_SOURCE.matchAll(/'(trip\.occurrence-[a-z-]+)'/gu)]
  return [...new Set(matches.map(([, key]) => key as string))].toSorted()
}

describe('contrato de paridade das chaves de ocorrência de parada (spec 082 D8)', () => {
  test('as chaves são exatamente as do catálogo da API', () => {
    expect(Object.values(TRIP_OCCURRENCE_TEMPLATE_KEY).toSorted()).toEqual([...apiOccurrenceKeys()])
  })

  test('o catálogo da API declara os mesmos marcadores para cada chave de ocorrência', () => {
    for (const name of Object.keys(TRIP_OCCURRENCE_TEMPLATE_KEY)) {
      const entryStart = API_CATALOG_SOURCE.indexOf(
        `templateKey: NOTIFICATION_TEMPLATE_KEY.${name}`,
      )
      expect(`${name}: ${entryStart >= 0}`).toBe(`${name}: true`)
      const before = API_CATALOG_SOURCE.slice(0, entryStart)
      const placeholders = /placeholders: \[([^\]]*)\],?\s*$/u.exec(before.trimEnd())?.[1] ?? ''
      for (const marker of TRIP_OCCURRENCE_TEMPLATE_PLACEHOLDERS) {
        expect(`${name}: ${placeholders.includes(`'${marker}'`)}`).toBe(`${name}: true`)
      }
    }
  })

  /** `other` não tem chave de propósito: motivo sem template grava a ocorrência e segue. */
  test('não existe chave para `other`', () => {
    const keys = Object.values(TRIP_OCCURRENCE_TEMPLATE_KEY)
    expect(keys.some((key) => key.includes('other'))).toBe(false)
  })

  test('os marcadores são nota, hora e parada — nunca PII', () => {
    expect([...TRIP_OCCURRENCE_TEMPLATE_PLACEHOLDERS].toSorted()).toEqual([
      'documentLabel',
      'occurredAt',
      'stopLabel',
    ])
  })
})
