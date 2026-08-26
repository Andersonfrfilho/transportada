/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateAccountUseCase } from '../../src/fleet/application/aggregate-account.use-case.js'
import {
  AggregateAccountAlreadyLinkedError,
  AggregateAccountDriverNotFoundError,
} from '../../src/fleet/domain/aggregate-account.error.js'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture.js'
import {
  FakeAggregateAccountRepository,
  FakeAggregateAccountUserModule,
} from '../fixtures/aggregate-accounts.fixture.js'

const UNIT_COMPANY_ID = COMPANY_CONTEXT.companyId

function buildUseCase(overrides: { readonly repository?: FakeAggregateAccountRepository } = {}) {
  const repository = overrides.repository ?? new FakeAggregateAccountRepository()
  const userModule = new FakeAggregateAccountUserModule()
  const useCase = createAggregateAccountUseCase({
    companyGroupRepository: {
      async listGroupUnits() {
        return [{ cnpj: '12345678000195', companyId: UNIT_COMPANY_ID } as never]
      },
    },
    landingCompanyId: UNIT_COMPANY_ID,
    repository,
    userModule,
  })
  return { repository, useCase, userModule }
}

describe('aggregate account use case', () => {
  test('a document the group has never seen — no application, no driver — is refused', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.register({ email: 'a@example.com', name: 'Fulano', password: 'senha1234', taxId: '12345678901' }),
    ).rejects.toBeInstanceOf(AggregateAccountDriverNotFoundError)
  })

  test('a document already linked to another account is refused', async () => {
    const repository = new FakeAggregateAccountRepository()
    repository.eligibleByTaxId.set('12345678901', { companyId: UNIT_COMPANY_ID, taxId: '12345678901' })
    repository.linkedTaxIds.add('12345678901')
    const { useCase } = buildUseCase({ repository })

    await expect(
      useCase.register({ email: 'a@example.com', name: 'Fulano', password: 'senha1234', taxId: '12345678901' }),
    ).rejects.toBeInstanceOf(AggregateAccountAlreadyLinkedError)
  })

  test('registers the account for a pending application — before approval', async () => {
    const repository = new FakeAggregateAccountRepository()
    repository.eligibleByTaxId.set('12345678901', { companyId: UNIT_COMPANY_ID, taxId: '12345678901' })
    const { useCase, userModule } = buildUseCase({ repository })

    const session = await useCase.register({
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      password: 'senha1234',
      taxId: '123.456.789-01',
    })

    expect(session.accessToken).toBe('access-token')
    expect(userModule.createUserCalls).toHaveLength(1)
    expect(userModule.createUserCalls[0]?.role).toBe('aggregate')
    expect(repository.linkCalls).toEqual([
      { companyId: UNIT_COMPANY_ID, taxId: '12345678901', userId: 'user-1' },
    ])
  })

  test('registers the account for an already-approved driver too', async () => {
    const repository = new FakeAggregateAccountRepository()
    repository.eligibleByTaxId.set('98765432100', { companyId: UNIT_COMPANY_ID, taxId: '98765432100' })
    const { useCase } = buildUseCase({ repository })

    const session = await useCase.register({
      email: 'aprovado@example.com',
      name: 'Ciclano',
      password: 'senha1234',
      taxId: '98765432100',
    })

    expect(session.accessToken).toBe('access-token')
  })

  test('a CNPJ never matches — the aggregate driver is always a physical person', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.register({
        email: 'a@example.com',
        name: 'Fulano',
        password: 'senha1234',
        taxId: '12345678000195',
      }),
    ).rejects.toBeInstanceOf(AggregateAccountDriverNotFoundError)
  })
})
