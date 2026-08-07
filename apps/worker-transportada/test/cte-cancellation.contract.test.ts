/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from '../src/cte-issuance/application/cte-issuance-worker-message-handler.service.js'
import { resolveCteBatchStatus } from '../src/cte-issuance/domain/cte-batch-progress.policy.js'
import { createCteFiscalDocumentStorage } from '../src/cte-issuance/infrastructure/cte-fiscal-document-storage.gateway.js'
import { createCteFiscalGateway } from '../src/cte-issuance/infrastructure/cte-fiscal-gateway.js'
import {
  cteProcessingEnvelopeV1Schema,
  type CteProcessingEnvelopeV1,
} from '../src/messaging/cte-processing-envelope.schema.js'
import { startCteIssuanceConsumer } from '../src/runtime/cte-issuance-consumer.service.js'

import {
  ACCESS_KEY,
  ATTEMPT_ID,
  AUTHORIZATION_PROTOCOL,
  CANCELLATION_INPUT,
  CANCELLATION_PROTOCOL,
  CANCELLATION_XML,
  CANCEL_ENVELOPE,
  CERTIFICATE_PASSWORD,
  COMPANY_ID,
  JUSTIFICATION,
  createCancellationEffectFixture,
} from './cte-cancellation/fixture.js'

const CANCELLATION_XML_SHA256 = createHash('sha256').update(CANCELLATION_XML).digest('hex')

describe('CT-e cancellation envelope contract', () => {
  test('accepts the canonical cancel requested envelope', () => {
    const result = cteProcessingEnvelopeV1Schema.safeParse(CANCEL_ENVELOPE)

    expect(result.success).toBe(true)
  })

  test('rejects a cancel attempt kind outside the contract', () => {
    const envelope = {
      ...CANCEL_ENVELOPE,
      payload: { ...CANCEL_ENVELOPE.payload, attemptKind: 'inutilizacao' },
    }

    expect(cteProcessingEnvelopeV1Schema.safeParse(envelope).success).toBe(false)
  })
})

describe('CT-e cancellation fiscal gateway contract', () => {
  test('sends access key, authorization protocol and justification to the provider', async () => {
    const calls: Array<Record<string, unknown>> = []
    const gateway = createCteFiscalGateway({
      createProvider: () => ({
        cancel: async (params) => {
          calls.push({
            chaveAcesso: params.chaveAcesso,
            justificativa: params.justificativa,
            protocolo: params.protocolo,
          })
          return {
            protocolo: CANCELLATION_PROTOCOL,
            rawResponse: {},
            success: true,
            xmlEvento: CANCELLATION_XML,
          }
        },
        emit: async () => {
          throw new Error('unreachable')
        },
        testConnection: async () => ({ ok: true, message: 'ok', rawResponse: {} }),
      }),
    })

    const outcome = await gateway.cancel({
      command: {
        accessKey: ACCESS_KEY,
        authorizationProtocol: AUTHORIZATION_PROTOCOL,
        documentId: CANCELLATION_INPUT.documentId,
        justification: JUSTIFICATION,
        tenantId: COMPANY_ID,
      },
      config: CANCELLATION_INPUT.config,
    })

    expect(calls).toEqual([
      {
        chaveAcesso: ACCESS_KEY,
        justificativa: JUSTIFICATION,
        protocolo: AUTHORIZATION_PROTOCOL,
      },
    ])
    expect(outcome).toMatchObject({
      eventXml: CANCELLATION_XML,
      protocol: CANCELLATION_PROTOCOL,
      status: 'ok',
    })
    expect(JSON.stringify(outcome)).not.toContain(CERTIFICATE_PASSWORD)
    expect(JSON.stringify(outcome)).not.toContain('BASE64CERT')
  })

  test('maps a SEFAZ refusal to a rejected outcome carrying the cStat', async () => {
    const gateway = createCteFiscalGateway({
      createProvider: () => ({
        cancel: async () => ({ errorCode: '573', rawResponse: {}, success: false }),
        emit: async () => {
          throw new Error('unreachable')
        },
        testConnection: async () => ({ ok: true, message: 'ok', rawResponse: {} }),
      }),
    })

    const outcome = await gateway.cancel({
      command: {
        accessKey: ACCESS_KEY,
        authorizationProtocol: AUTHORIZATION_PROTOCOL,
        documentId: CANCELLATION_INPUT.documentId,
        justification: JUSTIFICATION,
        tenantId: COMPANY_ID,
      },
      config: CANCELLATION_INPUT.config,
    })

    expect(outcome).toMatchObject({ rejection: { code: '573' }, status: 'rejected' })
    expect(outcome.raw).toBeDefined()
  })

  test('maps a transport failure to a retryable error outcome', async () => {
    const gateway = createCteFiscalGateway({
      createProvider: () => ({
        cancel: async () => {
          throw Object.assign(new Error('timed out'), { name: 'FiscalTimeoutError' })
        },
        emit: async () => {
          throw new Error('unreachable')
        },
        testConnection: async () => ({ ok: true, message: 'ok', rawResponse: {} }),
      }),
    })

    const outcome = await gateway.cancel({
      command: {
        accessKey: ACCESS_KEY,
        authorizationProtocol: AUTHORIZATION_PROTOCOL,
        documentId: CANCELLATION_INPUT.documentId,
        justification: JUSTIFICATION,
        tenantId: COMPANY_ID,
      },
      config: CANCELLATION_INPUT.config,
    })

    expect(outcome).toMatchObject({ cause: 'FiscalTimeoutError', status: 'error' })
  })
})

describe('CT-e cancellation XML storage contract', () => {
  test('stores the event XML beside the authorized one under the tenant prefix', async () => {
    const stored: Array<Record<string, unknown>> = []
    const storage = createCteFiscalDocumentStorage({
      bucket: 'fiscal-documents',
      gateway: {
        storeObject: async (params) => {
          stored.push({
            bucket: params.bucket,
            contentLength: params.contentLength,
            contentType: params.contentType,
            key: params.key,
            sha256: params.sha256,
          })
          return undefined as never
        },
      },
    })

    const object = await storage.storeCancellationXml({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      xml: CANCELLATION_XML,
    })

    expect(stored).toEqual([
      {
        bucket: 'fiscal-documents',
        contentLength: Buffer.byteLength(CANCELLATION_XML),
        contentType: 'application/xml',
        key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/cancellation.xml`,
        sha256: CANCELLATION_XML_SHA256,
      },
    ])
    expect(object).toMatchObject({
      bucket: 'fiscal-documents',
      key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/cancellation.xml`,
      sha256: CANCELLATION_XML_SHA256,
      sizeBytes: Buffer.byteLength(CANCELLATION_XML),
    })
  })
})

describe('CT-e cancellation worker effect contract', () => {
  test('persists the event XML and the cancellation protocol after SEFAZ accepts', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => ({
        protocolo: CANCELLATION_PROTOCOL,
        rawResponse: {},
        success: true,
        xmlEvento: CANCELLATION_XML,
      }),
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.inFlightCalls).toEqual([ATTEMPT_ID])
    expect(fixture.providerCalls).toEqual([
      {
        chaveAcesso: ACCESS_KEY,
        justificativa: JUSTIFICATION,
        protocolo: AUTHORIZATION_PROTOCOL,
      },
    ])
    expect(fixture.storedXml).toEqual([{ accessKey: ACCESS_KEY, companyId: COMPANY_ID }])
    expect(fixture.cancelledCalls).toEqual([
      {
        accessKey: ACCESS_KEY,
        cancellationProtocol: CANCELLATION_PROTOCOL,
        xml: {
          bucket: 'fiscal-documents',
          key: `tenants/${COMPANY_ID}/cte-documents/${ACCESS_KEY}/cancellation.xml`,
          objectId: expect.any(String),
          sha256: CANCELLATION_XML_SHA256,
          sizeBytes: Buffer.byteLength(CANCELLATION_XML),
        },
      },
    ])
  })

  test('settles the cancellation even when the XML storage breaks', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => ({
        protocolo: CANCELLATION_PROTOCOL,
        rawResponse: {},
        success: true,
        xmlEvento: CANCELLATION_XML,
      }),
      storeCancellationXml: async () => {
        throw new Error('minio is unreachable')
      },
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.cancelledCalls).toEqual([
      {
        accessKey: ACCESS_KEY,
        cancellationProtocol: CANCELLATION_PROTOCOL,
        xml: undefined,
      },
    ])
  })

  test('releases the cancellation intent when SEFAZ refuses the event', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => ({ errorCode: '573', rawResponse: {}, success: false }),
    })

    await expect(fixture.effect.execute({ envelope: fixture.envelope })).rejects.toBeInstanceOf(
      CteIssuanceFatalError,
    )
    expect(fixture.rejectedCalls).toEqual([{ errorCode: '573' }])
    expect(fixture.cancelledCalls).toEqual([])
    expect(fixture.storedXml).toEqual([])
  })

  test('keeps the cancellation intent and retries on a transport failure', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => {
        throw Object.assign(new Error('down'), { name: 'FiscalTimeoutError' })
      },
    })

    await expect(fixture.effect.execute({ envelope: fixture.envelope })).rejects.toBeInstanceOf(
      CteIssuanceRecoverableError,
    )
    expect(fixture.retryCalls).toEqual([{ cause: 'FiscalTimeoutError' }])
    expect(fixture.rejectedCalls).toEqual([])
    expect(fixture.cancelledCalls).toEqual([])
  })

  test('never reaches SEFAZ when the cancellation target cannot be resolved', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => ({ rawResponse: {}, success: true }),
      resolveCancellationInput: async () => null,
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    expect(fixture.providerCalls).toEqual([])
    expect(fixture.cancelledCalls).toEqual([])
    expect(fixture.inFlightCalls).toEqual([])
  })

  test('never leaks certificate material through the cancellation write-back', async () => {
    const fixture = createCancellationEffectFixture({
      cancel: async () => ({
        protocolo: CANCELLATION_PROTOCOL,
        rawResponse: {},
        success: true,
        xmlEvento: CANCELLATION_XML,
      }),
    })

    await fixture.effect.execute({ envelope: fixture.envelope })

    const serialized = JSON.stringify([fixture.cancelledCalls, fixture.storedXml])
    expect(serialized).not.toContain(CERTIFICATE_PASSWORD)
    expect(serialized).not.toContain('BASE64CERT')
  })
})

describe('CT-e cancellation consumer routing contract', () => {
  test('routes the cancel event to the effect instead of dead-lettering it', async () => {
    const executed: string[] = []
    const { handler } = await startConsumerFixture({
      execute: async ({ envelope }) => {
        executed.push(envelope.type)
      },
    })

    const result = await handler({ payload: CANCEL_ENVELOPE, retryCount: 0 })

    expect(executed).toEqual(['transportada.cte.item.cancel.requested'])
    expect(result).toEqual({ type: 'ack' })
  })

  test('still dead-letters an event type outside the CT-e issuance rail', async () => {
    const { handler } = await startConsumerFixture({ execute: async () => {} })

    const result = await handler({
      payload: { ...CANCEL_ENVELOPE, type: 'transportada.nfe.import.requested' },
      retryCount: 0,
    })

    expect(result).toEqual({ type: 'dead-letter' })
  })
})

type ConsumerHandler = (params: {
  readonly payload: unknown
  readonly retryCount: number
}) => Promise<{ readonly type: string }>

async function startConsumerFixture(input: {
  readonly execute: (params: { readonly envelope: CteProcessingEnvelopeV1 }) => Promise<void>
}): Promise<{ readonly handler: ConsumerHandler }> {
  let handler: ConsumerHandler | undefined

  await startCteIssuanceConsumer({
    config: { prefetch: 1 } as Parameters<typeof startCteIssuanceConsumer>[0]['config'],
    effect: input.execute === undefined ? { execute: async () => {} } : { execute: input.execute },
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    provider: {
      consume: async (params: { readonly handler: ConsumerHandler }) => {
        handler = params.handler
        return { cancel: async () => {} }
      },
    } as unknown as Parameters<typeof startCteIssuanceConsumer>[0]['provider'],
    repository: {
      hasProcessed: async () => false,
      markDeadLettered: async () => {},
      markProcessed: async () => {},
      markReconciliationRequired: async () => {},
      scheduleRetry: async () => {},
    },
    retryPolicyResolver: {
      resolve: async () => ({ backoffSeconds: [5], maxAttempts: 3 }),
    },
  })

  if (handler === undefined) throw new Error('consumer handler was not registered')
  return { handler }
}

describe('CT-e batch progress with cancelled items contract', () => {
  test('closes the batch when every item settled as authorized or cancelled', () => {
    expect(resolveCteBatchStatus(['authorized', 'cancelled'])).toBe('done')
    expect(resolveCteBatchStatus(['cancelled'])).toBe('done')
  })

  test('keeps reporting error and in flight for the remaining outcomes', () => {
    expect(resolveCteBatchStatus(['cancelled', 'rejected'])).toBe('error')
    expect(resolveCteBatchStatus(['cancelled', 'in_flight'])).toBe('in_flight')
  })
})
