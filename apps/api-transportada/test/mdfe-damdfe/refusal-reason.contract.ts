/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { describeMdfeRefusal } from '../../src/mdfe-manifests/domain/mdfe-refusal-reason.policy.js'
import { TRIP_MANIFEST_BLOCKS } from '../../src/trips/domain/trip-manifest.policy.js'

describe('o motivo da recusa, dito para gente', () => {
  test('traduz o que a emissão automática recusa', () => {
    expect(describeMdfeRefusal('MDFE_MANIFEST_CREW_REQUIRED')).toBe('a viagem está sem condutor')
    expect(describeMdfeRefusal(TRIP_MANIFEST_BLOCKS.dischargeCitiesOverLimit)).toContain(
      'municípios',
    )
  })

  /**
   * Código desconhecido sai **como código**, nunca como "erro ao emitir": um código no aviso ainda é
   * pesquisável, e um genérico não é nada. É o que impede o mapa de virar dívida silenciosa.
   */
  test('o desconhecido chega ao usuário com o próprio código', () => {
    expect(describeMdfeRefusal('MDFE_ALGO_QUE_AINDA_NAO_EXISTE')).toBe(
      'MDFE_ALGO_QUE_AINDA_NAO_EXISTE',
    )
  })
})
