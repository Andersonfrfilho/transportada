/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_OCCURRENCE_TYPES } from '../../src/shared/trip-occurrence.constant.js'
import { buildOccurrenceNotificationView } from '../../src/trips/domain/occurrence-settings.policy.js'

describe('configuração do aviso por tipo (spec 079)', () => {
  /**
   * ⚠️ **A tela mostra os sete tipos, sempre.** Listar só o que já foi configurado esconderia
   * justamente os tipos que ninguém ligou — que são os que o operador está procurando quando abre
   * esta tela.
   */
  test('lista todo o catálogo, mesmo sem configuração nenhuma', () => {
    const view = buildOccurrenceNotificationView({ settings: [] })

    expect(view).toHaveLength(TRIP_OCCURRENCE_TYPES.length)
    expect(view.every((entry) => !entry.notifies)).toBe(true)
  })

  /** A ordem é a do catálogo — galpão antes de rua —, e ela é o que a tela lista. */
  test('mantém a ordem do catálogo', () => {
    expect(buildOccurrenceNotificationView({ settings: [] }).map((entry) => entry.type)).toEqual(
      TRIP_OCCURRENCE_TYPES.map((entry) => entry.type),
    )
  })

  test('reflete o que foi configurado', () => {
    const view = buildOccurrenceNotificationView({
      settings: [{ notifies: true, type: 'recusa_total' }],
    })

    expect(view.find((entry) => entry.type === 'recusa_total')?.notifies).toBe(true)
    expect(view.find((entry) => entry.type === 'item_faltante')?.notifies).toBe(false)
  })

  /**
   * ⚠️ **O grupo viaja junto**, porque é ele que a tela usa para separar galpão de rua — e é o
   * mesmo grupo que decide quem registra a ocorrência.
   */
  test('cada linha diz a que grupo pertence', () => {
    const view = buildOccurrenceNotificationView({ settings: [] })

    expect(view.find((entry) => entry.type === 'item_faltante')?.stage).toBe('separation')
    expect(view.find((entry) => entry.type === 'recusa_total')?.stage).toBe('delivery')
  })

  /** Tipo que saiu do catálogo mas continua no banco não aparece: o catálogo é a fonte. */
  test('configuração de tipo fora do catálogo é ignorada', () => {
    const view = buildOccurrenceNotificationView({
      settings: [{ notifies: true, type: 'tipo_que_nao_existe' }],
    })

    expect(view).toHaveLength(TRIP_OCCURRENCE_TYPES.length)
    expect(view.every((entry) => !entry.notifies)).toBe(true)
  })
})
