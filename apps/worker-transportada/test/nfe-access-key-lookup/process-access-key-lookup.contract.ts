/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

import type { DfeItem, ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { createProcessAccessKeyLookupUseCase } from '../../src/nfe-access-key-lookup/application/process-access-key-lookup.use-case.js'
import type {
  AccessKeyLookupGateway,
  AccessKeyLookupRecord,
  CloseLookupWithoutDocumentInput,
} from '../../src/nfe-access-key-lookup/application/process-access-key-lookup.types.js'
import type { AccessKeyLookupGatewayResult } from '../../src/nfe-access-key-lookup/domain/nfe-access-key-lookup.types.js'
import type { NfeAccessKeyEnvelopeV1 } from '../../src/messaging/nfe-access-key-envelope.schema.js'
import { DISTRIBUTION_CONFIG } from '../nfe-distribution/nfe-distribution.fixture.js'

const ACCESS_KEY = '35260112345678000190550010000000011000000011'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const LOOKUP_ID = '00000000-0000-4000-8000-000000000002'
const IMPORT_ID = '00000000-0000-4000-8000-000000000003'
const EVENT_ID = '00000000-0000-4000-8000-000000000004'
const USER_ID = '00000000-0000-4000-8000-000000000005'
const NOW = new Date('2026-11-06T12:00:00.000Z')

const envelope: NfeAccessKeyEnvelopeV1 = {
  actorId: USER_ID,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  eventId: EVENT_ID,
  occurredAt: NOW.toISOString(),
  payload: { importId: IMPORT_ID, lookupId: LOOKUP_ID },
  type: 'transportada.nfe.access-key.requested',
  version: 1,
}

const baseLookup: AccessKeyLookupRecord = {
  accessKey: ACCESS_KEY,
  companyId: COMPANY_ID,
  environment: 'homologation',
  id: LOOKUP_ID,
  importId: IMPORT_ID,
  requestedByUserId: USER_ID,
  status: 'queued',
}

function procNfeItem(): DfeItem {
  return {
    nsu: '1',
    schema: 'procNFe',
    xmlComprimido: gzipSync(Buffer.from('<nfeProc/>')).toString('base64'),
    xmlDecoded: '<nfeProc/>',
  }
}

function importedXml(accessKey = ACCESS_KEY): ImportedNfeXml {
  return { document: { accessKey }, kind: 'authorized-nfe' } as unknown as ImportedNfeXml
}

type Harness = ReturnType<typeof buildHarness>

function buildHarness(
  options: {
    readonly existingDocumentId?: string
    readonly lookup?: AccessKeyLookupRecord | undefined
    readonly noLookup?: boolean
    readonly processed?: boolean
    readonly reservation?:
      | { readonly reserved: true; readonly budgetLeft: number }
      | { readonly reserved: false; readonly notBefore: Date }
    readonly result?: AccessKeyLookupGatewayResult
    readonly importedAccessKey?: string
    readonly isDuplicate?: boolean
  } = {},
) {
  const calls: string[] = []
  const closed: CloseLookupWithoutDocumentInput[] = []
  const waiting: Array<{ notBefore: Date; cStat?: string }> = []
  const logs: Array<{ level: string; message: string; metadata?: Record<string, unknown> }> = []
  const gatewayCalls: string[] = []
  const stored: string[] = []
  let imported: { documentId: string; isDuplicate: boolean } | undefined
  let existingCompletion: string | undefined
  let processed = options.processed === true

  const gateway: AccessKeyLookupGateway = {
    async consultarPorChave(input) {
      gatewayCalls.push(input.chaveNfe)
      return options.result ?? { kind: 'document', item: procNfeItem() }
    },
  }
  const lookup = options.noLookup === true ? undefined : (options.lookup ?? baseLookup)

  const useCase = createProcessAccessKeyLookupUseCase({
    budget: {
      async block656() {
        calls.push('block656')
      },
      async reserve() {
        calls.push('reserve')
        return options.reservation ?? { budgetLeft: 14, reserved: true }
      },
    },
    clock: { now: () => NOW },
    gatewayFactory: {
      create() {
        calls.push('gateway.create')
        return gateway
      },
    },
    logger: {
      error: (message, metadata) =>
        logs.push({ level: 'error', message, metadata: metadata ?? {} }),
      info: (message, metadata) => logs.push({ level: 'info', message, metadata: metadata ?? {} }),
      warn: (message, metadata) => logs.push({ level: 'warn', message, metadata: metadata ?? {} }),
    },
    processedMessages: {
      async runOnce(params) {
        if (processed) return { type: 'ack' }
        const outcome = await params.effect()
        processed = true
        return outcome
      },
    },
    profile: {
      async loadConfig() {
        calls.push('loadConfig')
        return DISTRIBUTION_CONFIG
      },
    },
    repository: {
      async closeWithoutDocument(input) {
        closed.push(input)
      },
      async completeWithExistingDocument(input) {
        existingCompletion = input.documentId
      },
      async findDocumentId() {
        return options.existingDocumentId
      },
      async findLookup() {
        return lookup
      },
      async importDocument() {
        imported = { documentId: 'doc-1', isDuplicate: options.isDuplicate === true }
        return imported
      },
      async markQuerying() {
        calls.push('markQuerying')
      },
      async markWaiting(input) {
        waiting.push({ notBefore: input.notBefore })
      },
    },
    storage: {
      async storeDocument(input) {
        stored.push(input.sourceSha256)
        return { bucket: 'b', key: 'k', objectId: 'o', sha256: input.sourceSha256, sizeBytes: 10 }
      },
    },
    xmlImporter: {
      async importXml() {
        return importedXml(options.importedAccessKey)
      },
    },
  })

  return {
    calls,
    closed,
    gatewayCalls,
    get existingCompletion() {
      return existingCompletion
    },
    get imported() {
      return imported
    },
    logs,
    stored,
    useCase,
    waiting,
  }
}

function finishedLog(harness: Harness) {
  return harness.logs.find((entry) => entry.message === 'nfe_access_key_lookup_finished')
}

describe('process access key lookup contract', () => {
  test('procNFe is stored, imported and logged without the full key', async () => {
    const harness = buildHarness()

    await harness.useCase.execute(envelope)

    expect(harness.calls).toEqual(['markQuerying', 'reserve', 'loadConfig', 'gateway.create'])
    expect(harness.stored).toHaveLength(1)
    expect(harness.imported?.documentId).toBe('doc-1')
    expect(harness.closed).toEqual([])
    expect(finishedLog(harness)?.metadata).toEqual({
      accessKeyLast4: '0011',
      budgetLeft: 14,
      cStat: '138',
      companyId: COMPANY_ID,
      lookupId: LOOKUP_ID,
      status: 'imported',
    })
    expect(JSON.stringify(harness.logs)).not.toContain(ACCESS_KEY)
  })

  test('document that already arrived through distribution is reported as imported', async () => {
    const harness = buildHarness({ isDuplicate: true })

    await harness.useCase.execute(envelope)

    expect(finishedLog(harness)?.metadata?.status).toBe('imported')
    expect(harness.imported?.isDuplicate).toBe(true)
  })

  test('resNFe refuses with summary_only and closes the lookup', async () => {
    const harness = buildHarness({
      result: { item: { ...procNfeItem(), schema: 'resNFe' }, kind: 'document' },
    })

    await harness.useCase.execute(envelope)

    expect(harness.closed).toEqual([
      { cStat: '138', lookup: baseLookup, now: NOW, reason: 'summary_only', status: 'refused' },
    ])
    expect(harness.stored).toEqual([])
    expect(finishedLog(harness)?.metadata).toMatchObject({
      reason: 'summary_only',
      status: 'refused',
    })
  })

  test('cStat 640 refuses as not_interested and keeps the cStat', async () => {
    const harness = buildHarness({ result: { cStat: '640', kind: 'sefaz-rejection' } })

    await harness.useCase.execute(envelope)

    expect(harness.closed).toEqual([
      { cStat: '640', lookup: baseLookup, now: NOW, reason: 'not_interested', status: 'refused' },
    ])
    expect(finishedLog(harness)?.metadata).toMatchObject({ cStat: '640', reason: 'not_interested' })
  })

  test('cStat 656 blocks the budget for 65 minutes and parks the lookup as waiting', async () => {
    const harness = buildHarness({ result: { cStat: '656', kind: 'sefaz-rejection' } })

    await harness.useCase.execute(envelope)

    expect(harness.calls).toContain('block656')
    expect(harness.waiting).toEqual([{ notBefore: new Date(NOW.getTime() + 65 * 60 * 1000) }])
    expect(harness.closed).toEqual([])
    expect(finishedLog(harness)?.metadata).toMatchObject({ cStat: '656', status: 'waiting' })
  })

  test('timeout closes the lookup as failed with sefaz_unavailable', async () => {
    const harness = buildHarness({ result: { kind: 'unavailable' } })

    await harness.useCase.execute(envelope)

    expect(harness.closed).toEqual([
      { lookup: baseLookup, now: NOW, reason: 'sefaz_unavailable', status: 'failed' },
    ])
  })

  test('unmapped outcome fails the lookup and warns with the cStat', async () => {
    const harness = buildHarness({ result: { cStat: '999', kind: 'sefaz-rejection' } })

    await harness.useCase.execute(envelope)

    expect(harness.closed[0]).toMatchObject({ cStat: '999', reason: 'sefaz_unavailable' })
    const warning = harness.logs.find((entry) => entry.level === 'warn')
    expect(warning?.metadata).toMatchObject({ cStat: '999', lookupId: LOOKUP_ID })
  })

  test('budget exhausted parks the lookup as waiting without calling SEFAZ', async () => {
    const notBefore = new Date(NOW.getTime() + 30 * 60 * 1000)
    const harness = buildHarness({ reservation: { notBefore, reserved: false } })

    await harness.useCase.execute(envelope)

    expect(harness.waiting).toEqual([{ notBefore }])
    expect(harness.gatewayCalls).toEqual([])
    expect(harness.calls).not.toContain('loadConfig')
  })

  test('document already registered completes the lookup without SEFAZ or budget', async () => {
    const harness = buildHarness({ existingDocumentId: 'existing-doc' })

    await harness.useCase.execute(envelope)

    expect(harness.existingCompletion).toBe('existing-doc')
    expect(harness.calls).toEqual([])
    expect(harness.gatewayCalls).toEqual([])
    expect(finishedLog(harness)?.metadata?.status).toBe('imported')
  })

  test('missing lookup and terminal lookup are acked without effect', async () => {
    for (const lookup of [
      undefined,
      { ...baseLookup, status: 'imported' as const },
      { ...baseLookup, status: 'refused' as const },
    ]) {
      const harness = buildHarness(lookup === undefined ? { noLookup: true } : { lookup })

      await expect(harness.useCase.execute(envelope)).resolves.toEqual({ type: 'ack' })

      expect(harness.calls).toEqual([])
      expect(harness.closed).toEqual([])
    }
  })

  test('querying and waiting lookups are resumed', async () => {
    for (const status of ['querying', 'waiting'] as const) {
      const harness = buildHarness({ lookup: { ...baseLookup, status } })

      await harness.useCase.execute(envelope)

      expect(harness.gatewayCalls).toEqual([ACCESS_KEY])
    }
  })

  test('redelivery of a processed event does nothing', async () => {
    const harness = buildHarness({ processed: true })

    await expect(harness.useCase.execute(envelope)).resolves.toEqual({ type: 'ack' })

    expect(harness.calls).toEqual([])
    expect(harness.gatewayCalls).toEqual([])
  })

  test('a second delivery of the same event does not query SEFAZ twice', async () => {
    const harness = buildHarness()

    await harness.useCase.execute(envelope)
    await harness.useCase.execute(envelope)

    expect(harness.gatewayCalls).toHaveLength(1)
  })

  test('a document whose key differs from the lookup is a defect and throws', async () => {
    const harness = buildHarness({
      importedAccessKey: '35260112345678000190550010000000021000000028',
    })

    await expect(harness.useCase.execute(envelope)).rejects.toThrow(
      'NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISMATCH',
    )
    expect(harness.imported).toBeUndefined()
  })

  test('abandon closes an active lookup as failed and leaves a closed one alone', async () => {
    const active = buildHarness({ lookup: { ...baseLookup, status: 'querying' } })
    await active.useCase.abandon(envelope)
    expect(active.closed).toEqual([
      {
        lookup: { ...baseLookup, status: 'querying' },
        now: NOW,
        reason: 'sefaz_unavailable',
        status: 'failed',
      },
    ])

    const done = buildHarness({ lookup: { ...baseLookup, status: 'imported' } })
    await done.useCase.abandon(envelope)
    expect(done.closed).toEqual([])
  })
})
