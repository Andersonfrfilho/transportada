/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateApplicationsUseCase } from '../../src/fleet/application/aggregate-applications.use-case.js'
import {
  AggregateApplicationAlreadyReviewedError,
  AggregateApplicationOutsideGroupError,
  AggregateApplicationRejectionReasonRequiredError,
  AggregateApplicationRequiresManualDriverCreationError,
} from '../../src/fleet/domain/aggregate-application.error.js'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture.js'
import { FakeAggregateApplicationRepository } from '../fixtures/aggregate-applications.fixture.js'

const UNIT_COMPANY_ID = COMPANY_CONTEXT.companyId

function buildUseCase(
  overrides: { readonly repository?: FakeAggregateApplicationRepository } = {},
) {
  const repository = overrides.repository ?? new FakeAggregateApplicationRepository()
  const useCase = createAggregateApplicationsUseCase({
    companyGroupRepository: {
      async listGroupUnits() {
        return [{ cnpj: '12345678000195', companyId: UNIT_COMPANY_ID } as never]
      },
    },
    landingCompanyId: UNIT_COMPANY_ID,
    repository,
  })
  return { repository, useCase }
}

describe('aggregate applications use case', () => {
  test('submitting for a company outside the served group is refused', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.submit({
        companyId: crypto.randomUUID(),
        declaredData: {},
        email: 'a@example.com',
        name: 'Fulano',
        phone: '11999999999',
        taxId: '12345678901',
      }),
    ).rejects.toBeInstanceOf(AggregateApplicationOutsideGroupError)
  })

  test('a resend of an open application updates the same row instead of duplicating it', async () => {
    const { repository, useCase } = buildUseCase()
    const submit = () =>
      useCase.submit({
        companyId: UNIT_COMPANY_ID,
        declaredData: { vehiclePlate: 'ABC1D23' },
        email: 'candidato@example.com',
        name: 'Fulano de Tal',
        phone: '11988887777',
        taxId: '12345678901',
      })

    await submit()
    await submit()

    expect(repository.rows).toHaveLength(1)
    expect(repository.rows[0]?.resubmittedAt).not.toBeNull()
  })

  test('a document that already belongs to a driver in the group marks the row without refusing', async () => {
    const { repository, useCase } = buildUseCase()
    repository.driverIdByTaxId.set('12345678901', crypto.randomUUID())

    await useCase.submit({
      companyId: UNIT_COMPANY_ID,
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })

    expect(repository.rows).toHaveLength(1)
    expect(repository.rows[0]?.duplicateDriverId).not.toBeNull()
    expect(repository.rows[0]?.status).toBe('pending')
  })

  test('approving a duplicate links to the existing driver instead of creating one', async () => {
    const { repository, useCase } = buildUseCase()
    const existingDriverId = crypto.randomUUID()
    repository.driverIdByTaxId.set('12345678901', existingDriverId)
    await useCase.submit({
      companyId: UNIT_COMPANY_ID,
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '12345678901',
    })
    const applicationId = repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    const approved = await useCase.approve({ context: COMPANY_CONTEXT, id: applicationId })

    expect(approved.driverId).toBe(existingDriverId)
    expect(repository.createDriverCalls).toHaveLength(0)
  })

  test('approving without a match creates a driver, and rejects a rejection without a reason', async () => {
    const { repository, useCase } = buildUseCase()
    await useCase.submit({
      companyId: UNIT_COMPANY_ID,
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '98765432100',
    })
    const applicationId = repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    const approved = await useCase.approve({ context: COMPANY_CONTEXT, id: applicationId })

    expect(approved.driverId).not.toBeNull()
    expect(repository.createDriverCalls).toHaveLength(1)

    await expect(
      useCase.reject({ context: COMPANY_CONTEXT, id: applicationId, rejectionReason: '' }),
    ).rejects.toBeInstanceOf(AggregateApplicationAlreadyReviewedError)
  })

  test('rejecting without a reason is refused before touching the repository', async () => {
    const { repository, useCase } = buildUseCase()
    await useCase.submit({
      companyId: UNIT_COMPANY_ID,
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Fulano de Tal',
      phone: '11988887777',
      taxId: '11122233344',
    })
    const applicationId = repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    await expect(
      useCase.reject({ context: COMPANY_CONTEXT, id: applicationId, rejectionReason: '   ' }),
    ).rejects.toBeInstanceOf(AggregateApplicationRejectionReasonRequiredError)
  })

  test('approving a CNPJ application without a matched driver asks for manual creation', async () => {
    const { repository, useCase } = buildUseCase()
    await useCase.submit({
      companyId: UNIT_COMPANY_ID,
      declaredData: {},
      email: 'candidato@example.com',
      name: 'Transportes Fulano',
      phone: '11988887777',
      taxId: '12345678000195',
    })
    const applicationId = repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    await expect(
      useCase.approve({ context: COMPANY_CONTEXT, id: applicationId }),
    ).rejects.toBeInstanceOf(AggregateApplicationRequiresManualDriverCreationError)
  })
})
