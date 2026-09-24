/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  TRIP_DELIVERY_PROOF_KINDS,
  tripDeliveryProofs,
} from '../../src/database/database.schema.js'

const UNIQUE_NAME = 'trip_delivery_proofs_company_event_kind_unique'

/**
 * As duas escritas em `trip_delivery_proofs` são `onConflictDoUpdate` sobre
 * `(company, stop_event, kind)` (evidence.md da spec 184, T1.1). Com a unicidade parcial, o
 * `ON CONFLICT` precisa repetir o predicado, ou o Postgres não acha o árbitro e recusa o INSERT —
 * a baixa do motorista quebraria junto.
 */
const UPSERT_SOURCES: string[] = [
  '../../src/trips/infrastructure/drizzle-delivery-proof.repository.ts',
  '../../src/trips/infrastructure/drizzle-driver-field-report.repository.ts',
]

/**
 * Spec 184: a foto da carga é `kind` próprio, e ela **soma** — ao contrário do canhoto e da
 * assinatura, em que o segundo envio é correção e substitui o primeiro.
 */
describe('foto da carga no comprovante de entrega (spec 184)', () => {
  test('conhece o tipo cargo ao lado de photo e signature', () => {
    expect([...TRIP_DELIVERY_PROOF_KINDS].sort()).toEqual(['cargo', 'photo', 'signature'])
  })

  test('a unicidade por entrega e tipo deixou de ser constraint total', () => {
    const { uniqueConstraints } = getTableConfig(tripDeliveryProofs)

    expect(uniqueConstraints.map((constraint) => constraint.name)).not.toContain(UNIQUE_NAME)
  })

  test('a unicidade vira índice único parcial, que deixa cargo de fora', () => {
    const { indexes } = getTableConfig(tripDeliveryProofs)
    const unique = indexes.find((index) => index.config.name === UNIQUE_NAME)

    expect(unique?.config.unique).toBe(true)
    expect(unique?.config.columns.map((column) => ('name' in column ? column.name : ''))).toEqual([
      'company_id',
      'stop_event_id',
      'kind',
    ])
    expect(unique?.config.where).toBeDefined()
  })

  test.each(UPSERT_SOURCES)('%s repete o predicado no ON CONFLICT', (relativePath) => {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    const upserts = source.split('.onConflictDoUpdate(').slice(1)

    expect(upserts.length).toBeGreaterThan(0)
    for (const upsert of upserts) {
      expect(upsert.slice(0, 600)).toContain('targetWhere')
    }
  })
})
