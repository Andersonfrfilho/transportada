/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  resolveTripDataSavedAt,
  resolveTripViewStatus,
} from '@/modules/driver-trip/shared/tripQueryStatus.service'

/**
 * Spec 189 T9.2 (A2): a releitura de 30 s que falha no subsolo não pode trocar a viagem pela tela
 * de erro. Com dado em memória, a viagem fica, e a faixa diz de quando ele é.
 */
describe('o estado da tela da viagem', () => {
  it('releitura que falha com dado em memória mantém a viagem na tela', () => {
    expect(resolveTripViewStatus({ hasData: true, isError: true, isLoading: false })).toBe('ready')
  })

  it('erro sem dado nenhum é a tela de erro', () => {
    expect(resolveTripViewStatus({ hasData: false, isError: true, isLoading: false })).toBe('error')
  })

  it('carregando sem dado é esqueleto', () => {
    expect(resolveTripViewStatus({ hasData: false, isError: false, isLoading: true })).toBe(
      'loading',
    )
  })
})

describe('a hora do dado na faixa ("dados de HH:MM")', () => {
  const SAVED_AT = '2026-09-25T10:00:00.000Z'
  const UPDATED_AT = Date.parse('2026-09-25T11:30:00.000Z')

  it('boot sem rede: a hora do snapshot guardado', () => {
    expect(
      resolveTripDataSavedAt({
        canSync: false,
        dataUpdatedAt: UPDATED_AT,
        initialSavedAt: SAVED_AT,
        isRefetchError: false,
      }),
    ).toBe(SAVED_AT)
  })

  it('releitura falhou com sessão viva: a hora da última leitura boa', () => {
    expect(
      resolveTripDataSavedAt({
        canSync: true,
        dataUpdatedAt: UPDATED_AT,
        initialSavedAt: SAVED_AT,
        isRefetchError: true,
      }),
    ).toBe('2026-09-25T11:30:00.000Z')
  })

  it('com a leitura em dia, nenhuma faixa', () => {
    expect(
      resolveTripDataSavedAt({
        canSync: true,
        dataUpdatedAt: UPDATED_AT,
        initialSavedAt: SAVED_AT,
        isRefetchError: false,
      }),
    ).toBeUndefined()
  })
})
