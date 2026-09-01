/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  toCompanyUser,
  toRevealedCompanyUsers,
} from '../../src/modules/identity/shared/companyUsersResponse.validation'

const PAYLOAD = {
  data: [
    {
      email: 'ana@empresa.test',
      name: 'Ana Fiscal',
      phone: '11999998888',
      taxId: '12345678909',
      userId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e93',
    },
  ],
}

/**
 * Revelar é ação com trilha de auditoria do outro lado, então o que a tela faz com a resposta
 * importa: valor cru que chega torto não pode virar linha em branco silenciosa.
 */
describe('resposta da revelação', () => {
  test('lê o valor cru dos quatro campos', () => {
    const [user] = toRevealedCompanyUsers(PAYLOAD)

    expect(user?.email).toBe('ana@empresa.test')
    expect(user?.phone).toBe('11999998888')
    expect(user?.taxId).toBe('12345678909')
  })

  /** Campo ausente é vazio, não `undefined` renderizado como texto na célula. */
  test('campo ausente vira vazio', () => {
    const [user] = toRevealedCompanyUsers({ data: [{ userId: 'user-1' }] })

    expect(user?.email).toBe('')
    expect(user?.phone).toBe('')
    expect(user?.taxId).toBe('')
    expect(user?.userId).toBe('user-1')
  })

  test('lista vazia é resposta legítima, não falha', () => {
    expect(toRevealedCompanyUsers({ data: [] })).toEqual([])
  })

  test('corpo fora do formato é recusado', () => {
    expect(() => toRevealedCompanyUsers({ data: 'nada' })).toThrow()
    expect(() => toRevealedCompanyUsers({})).toThrow()
  })
})

/**
 * O vínculo com a frota vira link na tela. Link que não leva a lugar nenhum é pior que link ausente:
 * o operador clica, cai numa tela vazia e conclui que o sistema perdeu o cadastro.
 */
describe('vínculo com a frota na resposta do usuário', () => {
  const BASE = {
    contact: { channel: 'email', masked: 'a***@e***.test' },
    email: '',
    id: 'user-1',
    membershipId: 'membership-1',
    name: 'Ana',
    phone: '',
    roles: ['driver'],
    status: 'active',
    taxId: '',
    username: 'ana',
  }

  test('lê a ficha de motorista e os veículos atribuídos', () => {
    const user = toCompanyUser({
      ...BASE,
      fleet: { driverId: 'driver-1', vehicles: [{ id: 'vehicle-1', plate: 'ABC1D23' }] },
    })

    expect(user.fleet?.driverId).toBe('driver-1')
    expect(user.fleet?.vehicles).toEqual([{ id: 'vehicle-1', plate: 'ABC1D23' }])
  })

  test('sem ficha, não há vínculo — e não há link', () => {
    expect(toCompanyUser(BASE).fleet).toBeUndefined()
    expect(toCompanyUser({ ...BASE, fleet: { vehicles: [] } }).fleet).toBeUndefined()
  })

  /** Placa vazia não vira botão: o rótulo seria em branco e o clique, um mistério. */
  test('veículo sem placa é descartado, e o motorista continua', () => {
    const user = toCompanyUser({
      ...BASE,
      fleet: {
        driverId: 'driver-1',
        vehicles: [
          { id: 'vehicle-1', plate: '' },
          { id: 'vehicle-2', plate: 'XYZ4E56' },
        ],
      },
    })

    expect(user.fleet?.vehicles).toEqual([{ id: 'vehicle-2', plate: 'XYZ4E56' }])
  })
})
