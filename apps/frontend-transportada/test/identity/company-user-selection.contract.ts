/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { toAssignedCompanyUserRoles } from '../../src/modules/identity/shared/companyUsersResponse.validation'

/**
 * O lote é a ação mais fácil de errar da tela: ela muda várias pessoas de uma vez e não tem
 * desfazer. O que se prova aqui é a leitura da resposta — quem o lote alcançou, que é o que a tela
 * usa para dizer o que aconteceu.
 */
describe('resposta do lote de papéis', () => {
  test('lê quem o lote alcançou', () => {
    const result = toAssignedCompanyUserRoles({ data: { affectedUserIds: ['user-1', 'user-2'] } })

    expect(result.affectedUserIds).toEqual(['user-1', 'user-2'])
  })

  /**
   * Id fora da empresa não entra no lote e não vira erro; a lista menor é a resposta honesta, e a
   * tela precisa conseguir lê-la sem tratar como falha.
   */
  test('lote que alcançou menos gente do que foi pedido continua legível', () => {
    expect(toAssignedCompanyUserRoles({ data: { affectedUserIds: [] } }).affectedUserIds).toEqual(
      [],
    )
  })

  test('corpo fora do formato é recusado', () => {
    expect(() => toAssignedCompanyUserRoles({ data: {} })).toThrow()
    expect(() => toAssignedCompanyUserRoles({})).toThrow()
  })
})
