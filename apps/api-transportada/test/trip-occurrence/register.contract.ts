/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  acceptsOccurrenceType,
  resolveOccurrencePermission,
} from '../../src/trips/domain/occurrence.policy.js'

/**
 * Spec 079 T020. ⚠️ **A permissão sai do tipo, não da rota.** Uma rota só, com a autorização
 * decidida pelo corpo, seria o buraco: quem tem `trip.manage` mandaria `recusa_total` e registraria
 * ocorrência de rua sem nunca ter estado nela.
 */
describe('quem registra a ocorrência (spec 079 T020)', () => {
  test('separação é do galpão, e o galpão é trip.manage', () => {
    expect(resolveOccurrencePermission('item_faltante')).toBe('trip.manage')
    expect(resolveOccurrencePermission('item_avariado')).toBe('trip.manage')
  })

  test('entrega é da rua, e a rua é trip.report', () => {
    expect(resolveOccurrencePermission('recusa_total')).toBe('trip.report')
    expect(resolveOccurrencePermission('avaria_transporte')).toBe('trip.report')
  })

  /**
   * Tipo fora do catálogo **não vira permissão nenhuma**. Cair num padrão — a mais frouxa, ou a
   * mais estrita — seria decidir autorização por omissão; a fronteira recusa o corpo antes.
   */
  test('tipo desconhecido não produz permissão', () => {
    expect(resolveOccurrencePermission('inventado')).toBeNull()
  })

  /**
   * ⚠️ A rota é **por grupo**, não uma só autorizada por `trip.manage`: assim o router decide a
   * autorização estaticamente, do jeito que decide todas as outras, e o corpo nunca escolhe quem
   * pode gravar. O handler ainda recusa tipo do grupo errado — senão a rota do galpão gravaria
   * ocorrência de rua com a permissão do galpão.
   */
  test('cada grupo aceita só os seus tipos', () => {
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'item_faltante' })).toBe(true)
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'recusa_total' })).toBe(false)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'recusa_total' })).toBe(true)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'item_faltante' })).toBe(false)
  })

  test('tipo desconhecido não é aceito por grupo nenhum', () => {
    expect(acceptsOccurrenceType({ stage: 'separation', type: 'inventado' })).toBe(false)
    expect(acceptsOccurrenceType({ stage: 'delivery', type: 'inventado' })).toBe(false)
  })
})
