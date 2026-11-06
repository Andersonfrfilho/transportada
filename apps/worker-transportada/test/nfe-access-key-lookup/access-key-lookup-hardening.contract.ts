/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'
import type { RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { NfeAccessKeyEnvelopeV1 } from '../../src/messaging/nfe-access-key-envelope.schema.js'
import { describeLookupErrorForLog } from '../../src/nfe-access-key-lookup/domain/access-key-lookup-error-log.policy.js'
import { collectAutXmlCnpjs } from '../../src/nfe-access-key-lookup/domain/access-key-lookup-party.policy.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupError,
  NfeAccessKeyLookupNonRetryableError,
} from '../../src/nfe-access-key-lookup/domain/nfe-access-key-lookup.error.js'
import { prepareDistributionItem } from '../../src/nfe-distribution/infrastructure/nfe-distribution-item.mapper.js'
import { mapAccessKeyLookupError } from '../../src/nfe-distribution/infrastructure/nfe-access-key-lookup-result.mapper.js'
import { createAccessKeyLookupDocumentStorage } from '../../src/nfe-access-key-lookup/infrastructure/access-key-lookup-document-storage.js'
import { startNfeAccessKeyConsumer } from '../../src/runtime/nfe-access-key-consumer.service.js'
import { NFE_DISTRIBUTION_MAX_DECOMPRESSED_XML_BYTES } from '../../src/shared/nfe-distribution.constant.js'

const envelope: NfeAccessKeyEnvelopeV1 = {
  actorId: '00000000-0000-4000-8000-000000000005',
  companyId: '00000000-0000-4000-8000-000000000001',
  correlationId: 'corr-1',
  eventId: '00000000-0000-4000-8000-000000000004',
  occurredAt: '2026-11-06T12:00:00.000Z',
  payload: {
    importId: '00000000-0000-4000-8000-000000000003',
    lookupId: '00000000-0000-4000-8000-000000000002',
  },
  type: 'transportada.nfe.access-key.requested',
  version: 1,
}

describe('access key lookup hardening', () => {
  test('a docZip that inflates past the ceiling is refused instead of exhausting memory', async () => {
    const bomb = gzipSync(Buffer.alloc(NFE_DISTRIBUTION_MAX_DECOMPRESSED_XML_BYTES + 1))
    const dfe = { nsu: '1', schema: 'procNFe', xmlComprimido: bomb.toString('base64') }

    await expect(
      prepareDistributionItem({
        dfe: { ...dfe, xmlDecoded: '' },
        xmlImporter: { importXml: async () => Promise.reject(new Error('not reached')) },
      }),
    ).rejects.toThrow()
  })

  test('a typed three digit code only counts as a cStat on a SEFAZ message', () => {
    const fromSefaz = Object.assign(new Error('SEFAZ rejeitou a nota: [640] x'), { code: '640' })
    expect(mapAccessKeyLookupError(fromSefaz)).toEqual({ cStat: '640', kind: 'sefaz-rejection' })

    const foreign = Object.assign(new Error('socket hang up'), { code: '404' })
    expect(() => mapAccessKeyLookupError(foreign)).toThrow('socket hang up')
  })

  test('autXML CNPJs are read from the XML, with or without a namespace prefix', () => {
    const xml =
      '<infNFe><autXML><CNPJ>11111111000111</CNPJ></autXML><n:autXML><n:CNPJ>22222222000122</n:CNPJ></n:autXML></infNFe>'

    expect(collectAutXmlCnpjs(xml)).toEqual(['11111111000111', '22222222000122'])
  })

  test('error logs keep a truncated message and drop anything that looks like XML', () => {
    expect(describeLookupErrorForLog(new Error('x'.repeat(500))).message).toHaveLength(200)
    expect(
      describeLookupErrorForLog(new Error('<retDistDFeInt>cStat 999</retDistDFeInt>')),
    ).toEqual({
      reason: 'Error',
    })
    expect(describeLookupErrorForLog('boom')).toEqual({ reason: 'unknown' })
  })
})

type Outcome = { readonly type: string }

async function runHandler(options: {
  readonly abandonFails?: boolean
  readonly error: Error
  readonly retryCount: number
}) {
  const abandoned: string[] = []
  const logs: string[] = []
  let handler:
    | ((input: { payload: NfeAccessKeyEnvelopeV1; retryCount: number }) => Promise<Outcome>)
    | undefined
  const provider = {
    consume: async (consumeOptions: { handler: typeof handler }) => {
      handler = consumeOptions.handler
      return { cancel: async () => undefined }
    },
  } as unknown as RabbitMqProvider

  await startNfeAccessKeyConsumer({
    logger: {
      error: (message) => logs.push(message),
      info: () => undefined,
      warn: () => undefined,
    },
    maxRetries: 3,
    provider,
    useCase: {
      abandon: async () => {
        abandoned.push('abandon')
        if (options.abandonFails === true) throw new Error('database down')
      },
      execute: async () => Promise.reject(options.error),
    },
  })
  const outcome = await handler!({ payload: envelope, retryCount: options.retryCount })
  return { abandoned, logs, outcome }
}

describe('access key consumer routing', () => {
  test('a retryable failure retries while retries remain, without abandoning', async () => {
    const run = await runHandler({ error: new Error('timeout'), retryCount: 0 })

    expect(run.outcome).toEqual({ type: 'retry' })
    expect(run.abandoned).toEqual([])
  })

  test('a non-retryable failure abandons and dead-letters at the first attempt', async () => {
    const run = await runHandler({
      error: new NfeAccessKeyLookupNonRetryableError(
        NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.IMPORT_ID_MISMATCH,
      ),
      retryCount: 0,
    })

    expect(run.outcome).toEqual({ type: 'dead-letter' })
    expect(run.abandoned).toEqual(['abandon'])
  })

  test('a typed error that is not marked non-retryable still retries', async () => {
    const run = await runHandler({
      error: new NfeAccessKeyLookupError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.DOCUMENT_MISSING),
      retryCount: 1,
    })

    expect(run.outcome).toEqual({ type: 'retry' })
  })

  test('exhausted retries abandon and dead-letter', async () => {
    const run = await runHandler({ error: new Error('timeout'), retryCount: 3 })

    expect(run.outcome).toEqual({ type: 'dead-letter' })
    expect(run.abandoned).toEqual(['abandon'])
  })

  test('an abandon that fails is logged and the message is retried while retries remain', async () => {
    const run = await runHandler({
      abandonFails: true,
      error: new NfeAccessKeyLookupNonRetryableError(
        NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.ENVIRONMENT_MISMATCH,
      ),
      retryCount: 1,
    })

    expect(run.outcome).toEqual({ type: 'retry' })
    expect(run.logs).toContain('nfe_access_key_abandon_failed')
  })

  test('an abandon that fails with no retries left is logged and dead-lettered', async () => {
    const run = await runHandler({ abandonFails: true, error: new Error('x'), retryCount: 3 })

    expect(run.outcome).toEqual({ type: 'dead-letter' })
    expect(run.logs).toContain('nfe_access_key_abandon_failed')
  })
})

describe('access key document storage conflict', () => {
  const bytes = new TextEncoder().encode('<nfeProc/>')
  const sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
  const params = {
    accessKey: '35260112345678000190550010000000011000000011',
    companyId: envelope.companyId,
    importId: envelope.payload.importId,
    sourceBytes: bytes,
    sourceSha256: sha256,
  }

  function storageWithExisting(existing: string) {
    return createAccessKeyLookupDocumentStorage({
      bucket: 'bucket',
      finalStorage: {
        async storeImportedDocument() {
          throw new ObjectStorageError(OBJECT_STORAGE_ERROR_CODES.objectConflict, 'conflict')
        },
      } as never,
      gateway: {
        async getObjectStream() {
          return new Response(existing).body!
        },
      } as never,
    })
  }

  test('the same bytes already at the address become a reference to it', async () => {
    const stored = await storageWithExisting('<nfeProc/>').storeDocument(params)

    expect(stored.sha256).toBe(sha256)
    expect(stored.key).toContain(params.accessKey)
  })

  test('different bytes at the address are a non-retryable conflict', async () => {
    await expect(storageWithExisting('<other/>').storeDocument(params)).rejects.toMatchObject({
      code: 'NFE_ACCESS_KEY_LOOKUP_STORAGE_SHA_CONFLICT',
    })
  })
})
