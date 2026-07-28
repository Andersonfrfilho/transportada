/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { MDFE_PROCESSING_EVENT_TYPE } from '../src/messaging/mdfe-processing-envelope.schema.js'
import type { MdfeProcessingEnvelopeV1 } from '../src/messaging/mdfe-processing-envelope.schema.js'
import { createMdfeIssuanceWorkerEffect } from '../src/mdfe-issuance/application/mdfe-issuance-consumer.effect.js'
import {
  MdfeIssuanceFatalError,
  MdfeIssuanceRecoverableError,
  MdfeIssuanceWorkerMessageHandler,
} from '../src/mdfe-issuance/application/mdfe-issuance-worker-message-handler.service.js'

import {
  MDFE_CANCEL_COMMAND,
  MDFE_CLOSE_COMMAND,
  MDFE_FISCAL_CONFIG,
} from './mdfe-fiscal/fixture.js'

const COMPANY_ID = '2a0b2f1e-2f6a-4e1c-9f2c-6b1f0a1d2e3f'
const MANIFEST_ID = '9c2b1a0d-3e4f-4a5b-8c7d-6e5f4a3b2c1d'
const ATTEMPT_ID = '4f3e2d1c-0b9a-4c8d-9e7f-1a2b3c4d5e6f'
const EVENT_ID = '77777777-8888-4999-8aaa-bbbbbbbbbbbb'

const SILENT_LOGGER = { error: () => {}, info: () => {}, warn: () => {} }

const STORED_XML = {
  bucket: 'fiscal',
  key: `tenants/${COMPANY_ID}/mdfe-documents/${MDFE_CLOSE_COMMAND.accessKey}/authorized.xml`,
  objectId: '0d5c2c46-1f8e-4c37-9c67-2e4a3f8c6b91',
  sha256: 'a'.repeat(64),
  sizeBytes: 42,
}

type EnvelopeOverrides = {
  readonly attemptKind?: 'issue' | 'close' | 'cancel'
  readonly status?: string
  readonly type?: MdfeProcessingEnvelopeV1['type']
}

function envelope(overrides: EnvelopeOverrides = {}): MdfeProcessingEnvelopeV1 {
  return {
    actorId: '11111111-2222-4333-8444-555555555555',
    companyId: COMPANY_ID,
    correlationId: 'corr-1',
    eventId: EVENT_ID,
    occurredAt: '2026-07-28T12:00:00.000Z',
    payload: {
      attemptFingerprint: 'fingerprint-1',
      attemptId: ATTEMPT_ID,
      attemptKind: overrides.attemptKind ?? 'issue',
      manifestId: MANIFEST_ID,
      status: overrides.status ?? 'requested',
    },
    type: overrides.type ?? MDFE_PROCESSING_EVENT_TYPE.MANIFEST_ISSUE_REQUESTED,
    version: 1,
  }
}

type ProviderOutcomes = {
  readonly cancel?: Record<string, unknown>
  readonly close?: Record<string, unknown>
  readonly emit?: Record<string, unknown>
}

function createEffectFixture(
  params: {
    readonly outcomes?: ProviderOutcomes
    readonly settled?: boolean
    readonly storageFails?: boolean
  } = {},
) {
  const writeBackCalls: Record<string, unknown>[] = []
  const storedXml: Record<string, unknown>[] = []
  const record = (event: string) => async (input: Record<string, unknown>) => {
    const rest = Object.fromEntries(
      Object.entries(input).filter(([field]) => field !== 'occurredAt'),
    )
    writeBackCalls.push({ event, ...rest })
  }

  async function store(kind: string, input: { accessKey: string; companyId: string; xml: string }) {
    if (params.storageFails === true) throw new Error('storage is down')
    storedXml.push({ accessKey: input.accessKey, companyId: input.companyId, kind, xml: input.xml })
    return STORED_XML
  }

  const effect = createMdfeIssuanceWorkerEffect({
    authorizedDocumentStorage: { storeAuthorizedXml: async (input) => store('authorized', input) },
    createProvider: () => ({
      cancel: async () =>
        (params.outcomes?.cancel ?? {
          success: true,
          protocolo: 'PROTO-CANC-01',
          xmlEvento: '<procEventoMDFe/>',
          rawResponse: undefined,
        }) as never,
      close: async () =>
        (params.outcomes?.close ?? {
          success: true,
          protocolo: 'PROTO-ENC-01',
          xmlEvento: '<procEventoMDFe/>',
          rawResponse: undefined,
        }) as never,
      emit: async () =>
        (params.outcomes?.emit ?? {
          success: true,
          chaveAcesso: MDFE_CLOSE_COMMAND.accessKey,
          protocolo: 'PROTO-01',
          xmlAutorizado: '<mdfeProc versao="3.00"/>',
          rawResponse: undefined,
        }) as never,
      testConnection: async () => ({ ok: true, message: 'ok' }),
    }),
    eventDocumentStorage: { storeEventXml: async (input) => store(input.eventName, input) },
    logger: SILENT_LOGGER,
    resolveCancellationInput: async () => ({
      accessKey: MDFE_CANCEL_COMMAND.accessKey,
      authorizationProtocol: MDFE_CANCEL_COMMAND.authorizationProtocol,
      config: MDFE_FISCAL_CONFIG,
      justification: MDFE_CANCEL_COMMAND.justification,
      manifestId: MANIFEST_ID,
      tenantId: COMPANY_ID,
    }),
    resolveClosureInput: async () => ({
      accessKey: MDFE_CLOSE_COMMAND.accessKey,
      authorizationProtocol: MDFE_CLOSE_COMMAND.authorizationProtocol,
      closureCityCode: MDFE_CLOSE_COMMAND.closureCityCode,
      closureDate: MDFE_CLOSE_COMMAND.closureDate,
      closureState: MDFE_CLOSE_COMMAND.closureState,
      config: MDFE_FISCAL_CONFIG,
      manifestId: MANIFEST_ID,
      tenantId: COMPANY_ID,
    }),
    resolveExecutionInput: async () => ({
      config: MDFE_FISCAL_CONFIG,
      manifestId: MANIFEST_ID,
      mdfeData: { ufFim: 'MG', ufInicio: 'SP' },
      tenantId: COMPANY_ID,
    }),
    settledAttemptGuard: { isSettled: async () => params.settled === true },
    writeBack: {
      recordAuthorized: record('authorized'),
      recordCancellationRejected: record('cancellation_rejected'),
      recordCancelled: record('cancelled'),
      recordClosed: record('closed'),
      recordClosureRejected: record('closure_rejected'),
      recordInFlight: record('in_flight'),
      recordRejected: record('rejected'),
      recordRetryScheduled: record('retry_scheduled'),
    },
  })

  return { effect, storedXml, writeBackCalls }
}

async function refusal(execute: () => Promise<unknown>): Promise<Error> {
  try {
    await execute()
  } catch (error: unknown) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error('expected the effect to throw')
}

describe('MDF-e issuance worker effect contract', () => {
  test('stores the authorized XML and writes the manifest back as authorized', async () => {
    const fixture = createEffectFixture()

    await fixture.effect.execute({ envelope: envelope() })

    expect(fixture.storedXml).toEqual([
      {
        accessKey: MDFE_CLOSE_COMMAND.accessKey,
        companyId: COMPANY_ID,
        kind: 'authorized',
        xml: '<mdfeProc versao="3.00"/>',
      },
    ])
    expect(fixture.writeBackCalls).toEqual([
      { attemptId: ATTEMPT_ID, companyId: COMPANY_ID, event: 'in_flight', manifestId: MANIFEST_ID },
      {
        accessKey: MDFE_CLOSE_COMMAND.accessKey,
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        event: 'authorized',
        fiscalDocument: {
          accessKey: MDFE_CLOSE_COMMAND.accessKey,
          authorizationProtocol: 'PROTO-01',
          fiscalEnvironment: 'homologation',
          fiscalNumber: 17n,
          fiscalSeries: '1',
          xml: STORED_XML,
        },
        manifestId: MANIFEST_ID,
        protocol: 'PROTO-01',
      },
    ])
  })

  /** Reemitir depois de a SEFAZ autorizar duplicaria o manifesto: falhar aqui só pede reconciliação. */
  test('keeps the authorization when the XML storage fails', async () => {
    const fixture = createEffectFixture({ storageFails: true })

    await fixture.effect.execute({ envelope: envelope() })

    const authorized = fixture.writeBackCalls.at(-1)
    expect(authorized).toMatchObject({ event: 'authorized', protocol: 'PROTO-01' })
    expect(authorized).not.toHaveProperty('fiscalDocument')
  })

  test('dead-letters a rejected transmission after writing the error code back', async () => {
    const fixture = createEffectFixture({
      outcomes: { emit: { success: false, errorCode: '999', rawResponse: undefined } },
    })

    const error = await refusal(() => fixture.effect.execute({ envelope: envelope() }))

    expect(error).toBeInstanceOf(MdfeIssuanceFatalError)
    expect(fixture.writeBackCalls.at(-1)).toMatchObject({ errorCode: '999', event: 'rejected' })
  })

  test('schedules a retry when the provider fails with an infrastructure error', async () => {
    const fixture = createEffectFixture()
    const failing = createMdfeIssuanceWorkerEffect({
      createProvider: () => ({
        cancel: async () => ({ success: true, rawResponse: undefined }) as never,
        close: async () => ({ success: true, rawResponse: undefined }) as never,
        emit: async () => {
          throw Object.assign(new Error('timed out'), { name: 'FiscalTimeoutError' })
        },
        testConnection: async () => ({ ok: true, message: 'ok' }),
      }),
      logger: SILENT_LOGGER,
      resolveExecutionInput: async () => ({
        config: MDFE_FISCAL_CONFIG,
        manifestId: MANIFEST_ID,
        mdfeData: {},
        tenantId: COMPANY_ID,
      }),
      writeBack: {
        recordAuthorized: async () => {},
        recordCancellationRejected: async () => {},
        recordCancelled: async () => {},
        recordClosed: async () => {},
        recordClosureRejected: async () => {},
        recordInFlight: async () => {},
        recordRejected: async () => {},
        recordRetryScheduled: async (input) => {
          fixture.writeBackCalls.push({ cause: input.cause, event: 'retry_scheduled' })
        },
      },
    })

    const error = await refusal(() => failing.execute({ envelope: envelope() }))

    expect(error).toBeInstanceOf(MdfeIssuanceRecoverableError)
    expect(fixture.writeBackCalls).toEqual([
      { cause: 'FiscalTimeoutError', event: 'retry_scheduled' },
    ])
  })

  test('closes the manifest storing the 110112 event XML', async () => {
    const fixture = createEffectFixture()

    await fixture.effect.execute({
      envelope: envelope({
        attemptKind: 'close',
        type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED,
      }),
    })

    expect(fixture.storedXml).toEqual([
      {
        accessKey: MDFE_CLOSE_COMMAND.accessKey,
        companyId: COMPANY_ID,
        kind: 'closure',
        xml: '<procEventoMDFe/>',
      },
    ])
    expect(fixture.writeBackCalls.at(-1)).toEqual({
      accessKey: MDFE_CLOSE_COMMAND.accessKey,
      attemptId: ATTEMPT_ID,
      closureCityCode: MDFE_CLOSE_COMMAND.closureCityCode,
      closureProtocol: 'PROTO-ENC-01',
      closureState: MDFE_CLOSE_COMMAND.closureState,
      companyId: COMPANY_ID,
      event: 'closed',
      manifestId: MANIFEST_ID,
      xml: STORED_XML,
    })
  })

  test('cancels the manifest storing the 110111 event XML', async () => {
    const fixture = createEffectFixture()

    await fixture.effect.execute({
      envelope: envelope({
        attemptKind: 'cancel',
        type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED,
      }),
    })

    expect(fixture.storedXml).toEqual([
      {
        accessKey: MDFE_CANCEL_COMMAND.accessKey,
        companyId: COMPANY_ID,
        kind: 'cancellation',
        xml: '<procEventoMDFe/>',
      },
    ])
    expect(fixture.writeBackCalls.at(-1)).toEqual({
      accessKey: MDFE_CANCEL_COMMAND.accessKey,
      attemptId: ATTEMPT_ID,
      cancellationProtocol: 'PROTO-CANC-01',
      companyId: COMPANY_ID,
      event: 'cancelled',
      manifestId: MANIFEST_ID,
      xml: STORED_XML,
    })
  })

  /** Cancelamento recusado libera a intenção: sem isso o manifesto trava sem poder tentar de novo. */
  test('releases the cancellation intent when SEFAZ refuses the event', async () => {
    const fixture = createEffectFixture({
      outcomes: { cancel: { success: false, errorCode: '573', rawResponse: undefined } },
    })

    const error = await refusal(() =>
      fixture.effect.execute({
        envelope: envelope({
          attemptKind: 'cancel',
          type: MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED,
        }),
      }),
    )

    expect(error).toBeInstanceOf(MdfeIssuanceFatalError)
    expect(fixture.writeBackCalls.at(-1)).toMatchObject({
      errorCode: '573',
      event: 'cancellation_rejected',
    })
    expect(fixture.storedXml).toEqual([])
  })

  test('skips an attempt that another delivery already settled', async () => {
    const fixture = createEffectFixture({ settled: true })

    await fixture.effect.execute({ envelope: envelope() })

    expect(fixture.writeBackCalls).toEqual([])
    expect(fixture.storedXml).toEqual([])
  })

  test('refuses a status that the outbox should have requeued instead', async () => {
    const fixture = createEffectFixture()

    const retry = await refusal(() =>
      fixture.effect.execute({ envelope: envelope({ status: 'retry_scheduled' }) }),
    )
    expect(retry).toBeInstanceOf(MdfeIssuanceRecoverableError)

    const unsupported = await refusal(() =>
      fixture.effect.execute({ envelope: envelope({ status: 'authorized' }) }),
    )
    expect(unsupported).toBeInstanceOf(MdfeIssuanceFatalError)
  })
})

type HandlerLedgerEntry = { readonly event: string } & Record<string, unknown>

function createHandlerFixture(params: { readonly error?: unknown; readonly processed?: boolean }) {
  const ledger: HandlerLedgerEntry[] = []

  const handler = new MdfeIssuanceWorkerMessageHandler({
    clock: { now: () => new Date('2026-07-28T12:00:00.000Z') },
    effect: {
      execute: async () => {
        ledger.push({ event: 'execute' })
        if (params.error !== undefined) throw params.error
      },
    },
    repository: {
      hasProcessed: async () => params.processed === true,
      markDeadLettered: async (input) => {
        ledger.push({ event: 'dead_lettered', reason: input.reason })
      },
      markProcessed: async () => {
        ledger.push({ event: 'processed' })
      },
      scheduleRetry: async (input) => {
        ledger.push({
          attempt: input.attempt,
          event: 'retry',
          nextAttemptAt: input.nextAttemptAt.toISOString(),
        })
      },
    },
    retryPolicyResolver: {
      resolve: async () => ({ backoffSeconds: [5, 30, 300], maxAttempts: 3 }),
    },
  })

  return { handler, ledger }
}

describe('MDF-e issuance worker message handler contract', () => {
  test('acks a redelivery that the idempotency ledger already recorded', async () => {
    const fixture = createHandlerFixture({ processed: true })

    const disposition = await fixture.handler.handle({ attempt: 0, envelope: envelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(fixture.ledger).toEqual([])
  })

  test('marks a successful delivery as processed', async () => {
    const fixture = createHandlerFixture({})

    const disposition = await fixture.handler.handle({ attempt: 0, envelope: envelope() })

    expect(disposition).toEqual({ type: 'ack' })
    expect(fixture.ledger).toEqual([{ event: 'execute' }, { event: 'processed' }])
  })

  test('retries a recoverable failure honouring the backoff curve', async () => {
    const fixture = createHandlerFixture({ error: new MdfeIssuanceRecoverableError('sefaz down') })

    const disposition = await fixture.handler.handle({ attempt: 0, envelope: envelope() })

    expect(disposition).toEqual({ type: 'retry' })
    expect(fixture.ledger.at(-1)).toEqual({
      attempt: 1,
      event: 'retry',
      nextAttemptAt: '2026-07-28T12:00:05.000Z',
    })
  })

  test('dead-letters a recoverable failure once the attempts are exhausted', async () => {
    const fixture = createHandlerFixture({ error: new MdfeIssuanceRecoverableError('sefaz down') })

    const disposition = await fixture.handler.handle({ attempt: 2, envelope: envelope() })

    expect(disposition).toEqual({ type: 'dead-letter' })
    expect(fixture.ledger.at(-1)).toEqual({ event: 'dead_lettered', reason: 'sefaz down' })
  })

  test('dead-letters a fatal failure without retrying', async () => {
    const fixture = createHandlerFixture({ error: new MdfeIssuanceFatalError('999') })

    const disposition = await fixture.handler.handle({ attempt: 0, envelope: envelope() })

    expect(disposition).toEqual({ type: 'dead-letter' })
    expect(fixture.ledger.at(-1)).toEqual({ event: 'dead_lettered', reason: '999' })
  })

  test('rethrows an unexpected error so the consumer does not swallow it', async () => {
    const fixture = createHandlerFixture({ error: new TypeError('bug') })

    const error = await refusal(() => fixture.handler.handle({ attempt: 0, envelope: envelope() }))

    expect(error).toBeInstanceOf(TypeError)
  })
})
