/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  resolveOccurrenceStage,
  TRIP_OCCURRENCE_TYPES,
} from '../../src/shared/trip-occurrence.constant.js'

const MIGRATION = new URL(
  '../../drizzle/20260902170000_trip_document_occurrences/migration.sql',
  import.meta.url,
)

/**
 * Spec 079 T020. O catálogo é **cópia por valor** no frontend, e a lista aqui é a fonte. Este
 * contrato guarda o lado da API; `frontend-transportada/test/trip/occurrence-catalog.contract.ts`
 * guarda o outro. Mudou tipo ou grupo de um lado? mude do outro.
 */
describe('catálogo de ocorrência (spec 079 T020)', () => {
  /** A ordem é a do fluxo — galpão antes de rua — e ela é o que a tela lista. */
  test('os sete tipos, na ordem do fluxo', () => {
    expect(TRIP_OCCURRENCE_TYPES.map((entry) => entry.type)).toEqual([
      'item_faltante',
      'item_avariado',
      'divergencia_quantidade',
      'recusa_total',
      'recusa_parcial',
      'avaria_transporte',
      'destinatario_ausente',
    ])
  })

  /**
   * ⚠️ **O grupo decide a permissão**: separação é `trip.manage` (galpão) e entrega é `trip.report`
   * (rua). Mover um tipo de grupo muda quem pode registrá-lo — é mudança de autorização disfarçada
   * de mudança de rótulo, e é por isso que ela é afirmada aqui por extenso.
   */
  test('cada tipo pertence ao grupo que decide quem o registra', () => {
    expect(resolveOccurrenceStage('item_faltante')).toBe('separation')
    expect(resolveOccurrenceStage('divergencia_quantidade')).toBe('separation')
    expect(resolveOccurrenceStage('recusa_total')).toBe('delivery')
    expect(resolveOccurrenceStage('destinatario_ausente')).toBe('delivery')
  })

  /** Tipo fora do catálogo é ausência, nunca um palpite de grupo — que seria palpite de permissão. */
  test('tipo desconhecido não ganha grupo', () => {
    expect(resolveOccurrenceStage('inventado')).toBeNull()
  })

  /**
   * O CHECK do banco e a constante saem da mesma lista dentro da API — mas a **migration** é SQL
   * escrito à mão, e ela não. Tipo novo na constante sem tipo novo na migration passa em todo teste
   * e é recusado pelo Postgres na primeira gravação real.
   */
  test('a migration conhece exatamente os mesmos tipos', () => {
    const sql = readFileSync(MIGRATION, 'utf8')

    for (const entry of TRIP_OCCURRENCE_TYPES) {
      expect(sql).toInclude(`'${entry.type}'`)
    }
  })
})
