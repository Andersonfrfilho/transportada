/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ACCESS_KEY,
  COMPANY_CONTEXT,
  COMPANY_ID,
  CORRELATION_ID,
  createFakeLookupUnitOfWork,
  DOCUMENT_ID,
  FINGERPRINT,
  IMPORT_ID,
  LOOKUP_ID,
  NOW,
  QUEUED_VIEW,
  REFUSAL_WINDOW_MS,
  REFUSED_VIEW,
  USER_ID,
  type FakeLookupScenario,
} from '../fixtures/nfe-access-key-lookup.fixture.js'
import { captureApiError } from '../fixtures/nfe-import-use-case.fixture.js'

type RequestUseCase = { execute(input: Record<string, unknown>): Promise<unknown> }

async function createUseCase(scenario: FakeLookupScenario = {}) {
  const fake = createFakeLookupUnitOfWork(scenario)
  const fingerprintCalls: { fields: readonly Uint8Array[]; operation: string }[] = []
  const module = (await import(
    '../../src/nfe-access-key-lookups/application/request-access-key-lookup.use-case.js'
  )) as {
    createRequestAccessKeyLookupUseCase(dependencies: Record<string, unknown>): RequestUseCase
  }
  const useCase = module.createRequestAccessKeyLookupUseCase({
    clock: { now: () => NOW },
    fingerprintService: {
      async create(input: { fields: readonly Uint8Array[]; operation: string }) {
        fingerprintCalls.push(input)
        return FINGERPRINT
      },
    },
    unitOfWork: fake.unitOfWork,
  })
  return { ...fake, fingerprintCalls, useCase }
}

const REQUEST = { accessKey: ACCESS_KEY, context: COMPANY_CONTEXT, correlationId: CORRELATION_ID }

describe('request access key lookup application contract', () => {
  test('creates import, lookup and outbox together, with no full key in the event', async () => {
    const { calls, order, useCase } = await createUseCase()

    const result = await useCase.execute(REQUEST)

    expect(result).toEqual({ kind: 'created', lookup: { id: LOOKUP_ID, status: 'queued' } })
    expect(order).toEqual([
      'readFiscalEnvironment',
      'findDocumentId',
      'findActiveLookup',
      'findRecentRefusal',
      'claimLookup',
      'createImport',
      'attachImport',
      'saveOutbox',
    ])
    expect(calls.claimed).toEqual([
      {
        accessKey: ACCESS_KEY,
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        environment: 'homologation',
        requestedByUserId: USER_ID,
      },
    ])
    expect(calls.imports).toEqual([
      {
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        idempotencyKey: `nfe-access-key-lookup:${LOOKUP_ID}`,
        requestFingerprint: FINGERPRINT,
        requestedByUserId: USER_ID,
      },
    ])
    expect(calls.attached).toEqual([
      { companyId: COMPANY_ID, importId: IMPORT_ID, lookupId: LOOKUP_ID },
    ])
    expect(calls.outbox).toEqual([
      {
        actorUserId: USER_ID,
        aggregateId: IMPORT_ID,
        aggregateType: 'nfe_import',
        companyId: COMPANY_ID,
        correlationId: CORRELATION_ID,
        eventId: expect.any(String),
        eventType: 'transportada.nfe.access-key.requested',
        eventVersion: 1,
        payload: { companyId: COMPANY_ID, importId: IMPORT_ID, lookupId: LOOKUP_ID },
      },
    ])
    expect(JSON.stringify(calls.outbox)).not.toContain(ACCESS_KEY)
  })

  test('derives the import fingerprint from company, environment and key under its own operation', async () => {
    const { fingerprintCalls, useCase } = await createUseCase({ environment: 'production' })

    await useCase.execute(REQUEST)

    const decoder = new TextDecoder()
    expect(fingerprintCalls).toHaveLength(1)
    expect(fingerprintCalls[0]?.operation).toBe('nfe-access-key-lookup.request')
    expect(fingerprintCalls[0]?.fields.map((field) => decoder.decode(field))).toEqual([
      COMPANY_ID,
      'production',
      ACCESS_KEY,
    ])
  })

  test('uses the fiscal environment of the company, the same one the distribution reads', async () => {
    const { calls, useCase } = await createUseCase({ environment: 'production' })

    await useCase.execute(REQUEST)

    expect(calls.claimed[0]).toMatchObject({ environment: 'production' })
  })

  test('409 NFE_DISTRIBUTION_NOT_CONFIGURED when the company has no fiscal profile', async () => {
    const { calls, useCase } = await createUseCase({ environment: null })

    const error = await captureApiError(() => useCase.execute(REQUEST))

    expect(error.status).toBe(409)
    expect(error.code).toBe('NFE_DISTRIBUTION_NOT_CONFIGURED')
    expect(calls.claimed).toEqual([])
  })

  test('found: the note is already registered, nothing is created', async () => {
    const { calls, order, useCase } = await createUseCase({ documentId: DOCUMENT_ID })

    const result = await useCase.execute(REQUEST)

    expect(result).toEqual({ documentId: DOCUMENT_ID, kind: 'found' })
    expect(order).not.toContain('claimLookup')
    expect(order).not.toContain('createImport')
    expect(calls.outbox).toEqual([])
  })

  test('active lookup for the same key is returned, nothing is created', async () => {
    const { calls, order, useCase } = await createUseCase({ activeLookup: QUEUED_VIEW })

    const result = await useCase.execute(REQUEST)

    expect(result).toEqual({ kind: 'existing', lookup: QUEUED_VIEW })
    expect(order).not.toContain('claimLookup')
    expect(calls.outbox).toEqual([])
  })

  test('RF8: a definitive refusal inside the last 24 hours is returned instead of asking SEFAZ again', async () => {
    const { calls, useCase } = await createUseCase({ recentRefusal: REFUSED_VIEW })

    const result = await useCase.execute(REQUEST)

    expect(result).toEqual({ kind: 'existing', lookup: REFUSED_VIEW })
    expect(calls.refusalQueries).toEqual([
      {
        accessKey: ACCESS_KEY,
        companyId: COMPANY_ID,
        environment: 'homologation',
        finishedAfter: new Date(NOW.getTime() - REFUSAL_WINDOW_MS),
      },
    ])
    expect(calls.outbox).toEqual([])
  })

  test('a concurrent request that lost the claim returns the lookup that won, creating no import', async () => {
    const { calls, order, useCase } = await createUseCase({
      activeLookupSequence: [null, QUEUED_VIEW],
      claimedLookupId: null,
    })

    const result = await useCase.execute(REQUEST)

    expect(result).toEqual({ kind: 'existing', lookup: QUEUED_VIEW })
    expect(order.slice(-2)).toEqual(['claimLookup', 'findActiveLookup'])
    expect(calls.imports).toEqual([])
    expect(calls.outbox).toEqual([])
  })
})
