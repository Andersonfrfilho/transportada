/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  CteIssuanceUnitOfWorkFixture,
  DEFAULT_RETRY_POLICY,
  IDEMPOTENCY_KEY,
  REPROCESS_IDEMPOTENCY_KEY,
  captureApiError,
  createCteIssuanceUseCaseForTest,
} from './support.js'

const ISSUE_INPUT = {
  batchId: BATCH_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
}

const REPROCESS_INPUT = {
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
}

const PRODUCTION_SETTINGS = {
  environment: 'production',
  retryPolicy: DEFAULT_RETRY_POLICY,
  series: '7',
} as const

const useCaseSource = await Bun.file(
  new URL('../../src/cte-issuance/application/cte-issuance.use-case.ts', import.meta.url),
).text()
const repositorySource = await Bun.file(
  new URL(
    '../../src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.ts',
    import.meta.url,
  ),
).text()

describe('CT-e issuance fiscal sequence resolution', () => {
  test('reserves the fiscal number in the environment and series configured by the company', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.fiscalSettings = PRODUCTION_SETTINGS
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const issuance = (await useCase.issue(ISSUE_INPUT)) as Record<string, unknown>

    expect(unitOfWork.fiscalSettingsQueries).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
    expect(unitOfWork.reservations).toEqual([
      {
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        companyId: COMPANY_CONTEXT.companyId,
        environment: 'production',
        kind: 'issue',
        series: '7',
      },
    ])
    expect(issuance['fiscalEnvironment']).toBe('production')
    expect(issuance['fiscalSeries']).toBe('7')
  })

  test('stamps the attempt and the transmittable payload with the resolved sequence', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.fiscalSettings = PRODUCTION_SETTINGS
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.issue(ISSUE_INPUT)

    expect(unitOfWork.attempts).toHaveLength(1)
    expect(unitOfWork.attempts[0]).toMatchObject({
      fiscalEnvironment: 'production',
      fiscalSeries: '7',
    })
    expect(unitOfWork.savedPayloads).toHaveLength(1)
    expect(unitOfWork.savedPayloads[0]?.['providerConfig']).toMatchObject({
      environment: 'production',
      serie: '7',
    })
  })

  test('rejects issuance when the company has no CT-e fiscal sequence configured', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.fiscalSettings = null
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() => useCase.issue(ISSUE_INPUT))

    expect(error.code).toBe('CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING')
    expect(error.status).toBe(422)
    expect(unitOfWork.reservations).toEqual([])
    expect(unitOfWork.attempts).toEqual([])
    expect(unitOfWork.savedPayloads).toEqual([])
  })

  test('keeps the reprocess in the environment and series of the original attempt', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.fiscalSettings = PRODUCTION_SETTINGS
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const issuance = (await useCase.reprocess(REPROCESS_INPUT)) as Record<string, unknown>

    expect(unitOfWork.reservations).toEqual([
      {
        batchId: BATCH_ID,
        batchItemId: BATCH_ITEM_ID,
        companyId: COMPANY_CONTEXT.companyId,
        environment: 'homologation',
        kind: 'reprocess',
        series: '1',
      },
    ])
    expect(unitOfWork.fiscalSettingsQueries).toEqual([])
    expect(issuance['fiscalEnvironment']).toBe('homologation')
    expect(issuance['fiscalSeries']).toBe('1')
  })

  test('leaves no hardcoded environment or series in the issuance path', () => {
    expect(useCaseSource).not.toContain(`fiscalEnvironment: 'homologation',`)
    expect(useCaseSource).not.toContain(`?? 'homologation'`)
    expect(repositorySource).not.toContain(`environment: 'homologation'`)
    expect(repositorySource).not.toContain('series: 1n')
    expect(repositorySource).not.toContain(`fiscalSeries: '1'`)
  })
})
