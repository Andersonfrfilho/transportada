/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregatePortalUseCase } from '../../src/fleet/application/aggregate-portal.use-case.js'
import { AggregatePortalAccountNotLinkedError } from '../../src/fleet/domain/aggregate-portal.error.js'
import { FakeAggregatePortalRepository } from '../fixtures/aggregate-portal.fixture.js'

const COMPANY_ID = crypto.randomUUID()

describe('aggregate portal use case', () => {
  test('an unlinked account is refused', async () => {
    const repository = new FakeAggregatePortalRepository()
    const useCase = createAggregatePortalUseCase({ repository })

    await expect(useCase.getProfile({ userId: 'user-1' })).rejects.toBeInstanceOf(
      AggregatePortalAccountNotLinkedError,
    )
  })

  test('a pending application, with no driver yet, reports pending status', async () => {
    const repository = new FakeAggregatePortalRepository()
    repository.accountsByUserId.set('user-1', { companyId: COMPANY_ID, taxId: '12345678901' })
    repository.applicationsByTaxId.set('12345678901', { rejectionReason: '', status: 'pending' })
    const useCase = createAggregatePortalUseCase({ repository })

    const profile = await useCase.getProfile({ userId: 'user-1' })

    expect(profile.status).toBe('pending')
    expect(profile.driver).toBeNull()
  })

  test('a rejected application carries the reason, with no driver', async () => {
    const repository = new FakeAggregatePortalRepository()
    repository.accountsByUserId.set('user-1', { companyId: COMPANY_ID, taxId: '12345678901' })
    repository.applicationsByTaxId.set('12345678901', {
      rejectionReason: 'CNH vencida',
      status: 'rejected',
    })
    const useCase = createAggregatePortalUseCase({ repository })

    const profile = await useCase.getProfile({ userId: 'user-1' })

    expect(profile.status).toBe('rejected')
    expect(profile.rejectionReason).toBe('CNH vencida')
    expect(profile.driver).toBeNull()
  })

  test('an existing driver record reports approved and carries the ficha data, even without an application row', async () => {
    const repository = new FakeAggregatePortalRepository()
    repository.accountsByUserId.set('user-1', { companyId: COMPANY_ID, taxId: '12345678901' })
    repository.driversByTaxId.set('12345678901', {
      address: { city: 'São Paulo', complement: '', district: 'Centro', number: '100', postalCode: '01000000', state: 'SP', street: 'Rua Um' },
      email: 'motorista@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
    })
    const useCase = createAggregatePortalUseCase({ repository })

    const profile = await useCase.getProfile({ userId: 'user-1' })

    expect(profile.status).toBe('approved')
    expect(profile.driver?.name).toBe('Fulano de Tal')
    expect(profile.driver?.address.city).toBe('São Paulo')
  })

  test('a driver record wins over a stale application row when both exist', async () => {
    const repository = new FakeAggregatePortalRepository()
    repository.accountsByUserId.set('user-1', { companyId: COMPANY_ID, taxId: '12345678901' })
    repository.applicationsByTaxId.set('12345678901', { rejectionReason: '', status: 'pending' })
    repository.driversByTaxId.set('12345678901', {
      address: { city: 'São Paulo', complement: '', district: 'Centro', number: '100', postalCode: '01000000', state: 'SP', street: 'Rua Um' },
      email: 'motorista@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
    })
    const useCase = createAggregatePortalUseCase({ repository })

    const profile = await useCase.getProfile({ userId: 'user-1' })

    expect(profile.status).toBe('approved')
  })
})
