/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  CTE_PROCESSING_EVENT_TYPE,
  type CteProcessingEnvelopeV1,
} from '../../messaging/cte-processing-envelope.schema.js'
import type {
  CteFiscalProvider,
  CteIssueOutcome,
  CteProviderConfig,
} from '../infrastructure/cte-fiscal-gateway.js'
import { createCteFiscalGateway } from '../infrastructure/cte-fiscal-gateway.js'

import type { MdfeAutoIssueTrigger } from '../../mdfe-auto-issue/application/mdfe-auto-issue.port.js'

import { isFiscalNumberRejection } from '../domain/cte-rejection.policy.js'
import type {
  CteIssuanceDiagnostics,
  CteIssuanceDiagnosticsPhase,
  CteIssuanceDiagnosticsRecord,
} from '../domain/cte-issuance-diagnostics.policy.js'
import {
  buildCteDiagnosticsRequest,
  buildCteDiagnosticsResponse,
  resolveCteDiagnosticsExpiry,
} from '../domain/cte-issuance-diagnostics.policy.js'
import {
  type CteUnknownErrorDescription,
  describeCteUnknownError,
} from '../domain/cte-unknown-error.policy.js'

import type { CteCancellationExecutionInput } from './cte-cancellation-input-resolver.service.js'
import type { CteIssuanceExecutionInput } from './cte-issuance-execution-input-resolver.service.js'
import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from './cte-issuance-worker-message-handler.service.js'

type CteIssuanceWorkerEffect = {
  execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

const FISCAL_NUMBER_BURNED_CAUSE = 'fiscal_number_burned'

export type CteIssuanceWriteBackKey = {
  readonly attemptId: string
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly occurredAt: Date
}

export type CteStoredXmlObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type CteAuthorizedDocumentStorage = {
  storeAuthorizedXml(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly xml: string
  }): Promise<CteStoredXmlObject>
}

export type CteCancellationDocumentStorage = {
  storeCancellationXml(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly xml: string
  }): Promise<CteStoredXmlObject>
}

export type CteIssuanceFiscalDocument = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly fiscalEnvironment: 'homologation' | 'production'
  readonly fiscalNumber: bigint
  readonly fiscalSeries: string
  readonly xml: CteStoredXmlObject
}

export type CteIssuanceWriteBack = {
  recordAuthorized(
    input: CteIssuanceWriteBackKey & {
      readonly accessKey?: string
      readonly fiscalDocument?: CteIssuanceFiscalDocument
      readonly protocol?: string
    },
  ): Promise<void>
  recordCancellationRejected(
    input: CteIssuanceWriteBackKey & { readonly errorCode: string },
  ): Promise<void>
  recordCancelled(
    input: CteIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly cancellationProtocol: string
      readonly xml?: CteStoredXmlObject
    },
  ): Promise<void>
  recordInFlight(input: CteIssuanceWriteBackKey): Promise<void>
  recordRejected(input: CteIssuanceWriteBackKey & { readonly errorCode: string }): Promise<void>
  recordRetryScheduled(input: CteIssuanceWriteBackKey & { readonly cause: string }): Promise<void>
}

export type CteSettledAttemptGuard = {
  isSettled(input: { readonly attemptId: string; readonly companyId: string }): Promise<boolean>
}

export type CteFiscalNumberProbeResult =
  | { readonly nextNumber: number; readonly outcome: 'advanced' }
  | { readonly outcome: 'exhausted' }

/**
 * Avança a numeração da série quando a SEFAZ acusa que o número já pertence a outro documento.
 * Reserva o próximo número, regrava o payload da tentativa e registra o motivo na trilha do item,
 * tudo na mesma transação — numeração fiscal não pode mudar sem deixar dito por quê.
 */
export type CteFiscalNumberProbe = {
  advance(input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly burnedNumber: number
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly occurredAt: Date
    readonly rejectionCode: string
    readonly series: string
  }): Promise<CteFiscalNumberProbeResult>
}

export function createCteIssuanceWorkerEffect(input: {
  readonly authorizedDocumentStorage?: CteAuthorizedDocumentStorage
  readonly cancellationDocumentStorage?: CteCancellationDocumentStorage
  readonly createProvider?: (input: { readonly config: CteProviderConfig }) => CteFiscalProvider
  readonly diagnostics?: CteIssuanceDiagnostics
  readonly fiscalNumberProbe?: CteFiscalNumberProbe
  /** Ausente é o gatilho desligado — instalação sem crachá emite MDF-e à mão (ADR-0047). */
  readonly mdfeAutoIssue?: MdfeAutoIssueTrigger
  readonly logger: WorkerLogger
  readonly resolveCancellationInput?: (params: {
    readonly envelope: CteProcessingEnvelopeV1
  }) => Promise<CteCancellationExecutionInput | null>
  readonly resolveExecutionInput?: (params: {
    readonly envelope: CteProcessingEnvelopeV1
  }) => Promise<CteIssuanceExecutionInput | null>
  readonly settledAttemptGuard?: CteSettledAttemptGuard
  readonly writeBack?: CteIssuanceWriteBack
}): CteIssuanceWorkerEffect {
  const gateway =
    input.createProvider === undefined
      ? null
      : createCteFiscalGateway({
          createProvider: input.createProvider,
        })

  /**
   * Diagnóstico é registro auxiliar com validade: nunca pode derrubar a emissão. Falhar aqui vira
   * aviso no log — o inverso já custou três CT-es presos em "Transmitindo" sem uma linha de rastro.
   */
  async function recordDiagnostics(params: {
    readonly durationMs?: number
    readonly envelope: CteProcessingEnvelopeV1
    readonly error?: CteUnknownErrorDescription
    readonly phase: CteIssuanceDiagnosticsPhase
    readonly request?: unknown
    readonly response?: unknown
  }): Promise<void> {
    if (input.diagnostics === undefined) return

    const occurredAt = new Date()
    const record: CteIssuanceDiagnosticsRecord = {
      attemptId: params.envelope.payload.attemptId,
      attemptKind: params.envelope.payload.attemptKind,
      batchId: params.envelope.payload.batchId,
      batchItemId: params.envelope.payload.batchItemId,
      companyId: params.envelope.companyId,
      correlationId: params.envelope.correlationId,
      durationMs: params.durationMs,
      error: params.error,
      eventId: params.envelope.eventId,
      expiresAt: resolveCteDiagnosticsExpiry({ occurredAt }),
      occurredAt,
      phase: params.phase,
      request: params.request,
      response: params.response,
    }

    try {
      await input.diagnostics.record(record)
    } catch (error) {
      safeLogWarn({
        logger: input.logger,
        message: 'cte_issuance_diagnostics_record_failed',
        metadata: {
          attemptId: record.attemptId,
          batchItemId: record.batchItemId,
          companyId: record.companyId,
          eventId: record.eventId,
          phase: record.phase,
          ...describeCteUnknownError(error),
        },
      })
    }
  }

  async function executeIssuance(envelope: CteProcessingEnvelopeV1): Promise<void> {
    try {
      await issueDocument(envelope)
    } catch (error) {
      if (error instanceof CteIssuanceFatalError || error instanceof CteIssuanceRecoverableError) {
        throw error
      }

      await recordDiagnostics({
        envelope,
        error: describeCteUnknownError(error),
        phase: 'error',
      })
      throw error
    }
  }

  async function issueDocument(envelope: CteProcessingEnvelopeV1): Promise<void> {
    const executionInput =
      input.resolveExecutionInput === undefined
        ? null
        : await input.resolveExecutionInput({ envelope })

    if (executionInput === null || gateway === null) {
      logPendingExecutionInput({
        envelope,
        hasGateway: gateway !== null,
        hasResolvedExecutionInput: executionInput !== null,
        logger: input.logger,
      })
      return
    }

    const createKey = (): CteIssuanceWriteBackKey => createWriteBackKey(envelope)
    await input.writeBack?.recordInFlight(createKey())

    const command = {
      tenantId: executionInput.tenantId,
      documentId: executionInput.documentId,
      cteData: executionInput.cteData,
    }
    await recordDiagnostics({
      envelope,
      phase: 'request',
      request: buildCteDiagnosticsRequest({ command, config: executionInput.config }),
    })

    const startedAt = Date.now()
    const outcome = await gateway.issue({ config: executionInput.config, command })

    await recordDiagnostics({
      durationMs: Date.now() - startedAt,
      envelope,
      phase: 'response',
      response: buildCteDiagnosticsResponse(outcome),
    })

    if (outcome.status === 'rejected') {
      const errorCode = outcome.rejection?.code ?? 'FISCAL_REJECTED'
      const advanced = await advanceBurnedFiscalNumber({
        config: executionInput.config,
        errorCode,
        key: createKey(),
        logger: input.logger,
        ...(input.fiscalNumberProbe === undefined ? {} : { probe: input.fiscalNumberProbe }),
      })

      if (advanced) {
        const cause = `${FISCAL_NUMBER_BURNED_CAUSE}:${errorCode}`
        await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
        throw new CteIssuanceRecoverableError(cause)
      }

      await input.writeBack?.recordRejected({ ...createKey(), errorCode })
      throw new CteIssuanceFatalError(errorCode)
    }

    if (outcome.status === 'error') {
      const cause = outcome.cause ?? 'cte issuance failed in fiscal provider'
      await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
      throw new CteIssuanceRecoverableError(cause)
    }

    const fiscalDocument = await storeFiscalDocument({
      companyId: envelope.companyId,
      config: executionInput.config,
      logger: input.logger,
      outcome,
      ...(input.authorizedDocumentStorage === undefined
        ? {}
        : { storage: input.authorizedDocumentStorage }),
    })

    await input.writeBack?.recordAuthorized({
      ...createKey(),
      ...(outcome.accessKey === undefined ? {} : { accessKey: outcome.accessKey }),
      ...(fiscalDocument === undefined ? {} : { fiscalDocument }),
      ...(outcome.protocol === undefined ? {} : { protocol: outcome.protocol }),
    })

    /**
     * Spec 065 D2b: a autorização é o evento que acende o manifesto, e **depois** da escrita —
     * disparar antes deixaria a API ler uma prontidão que ainda não conhece este CT-e. Ele não
     * lança: ver `createMdfeAutoIssueTrigger`.
     */
    await input.mdfeAutoIssue?.trigger({
      batchItemId: envelope.payload.batchItemId,
      companyId: envelope.companyId,
    })

    safeLogInfo({
      logger: input.logger,
      message: 'cte_issuance_worker_effect_authorized',
      metadata: {
        attemptId: envelope.payload.attemptId,
        attemptFingerprint: envelope.payload.attemptFingerprint,
        attemptKind: envelope.payload.attemptKind,
        batchId: envelope.payload.batchId,
        batchItemId: envelope.payload.batchItemId,
        companyId: envelope.companyId,
        eventId: envelope.eventId,
        protocol: outcome.protocol,
      },
    })
  }

  async function executeCancellation(envelope: CteProcessingEnvelopeV1): Promise<void> {
    const cancellationInput =
      input.resolveCancellationInput === undefined
        ? null
        : await input.resolveCancellationInput({ envelope })

    if (cancellationInput === null || gateway === null) {
      logPendingExecutionInput({
        envelope,
        hasGateway: gateway !== null,
        hasResolvedExecutionInput: cancellationInput !== null,
        logger: input.logger,
      })
      return
    }

    const createKey = (): CteIssuanceWriteBackKey => createWriteBackKey(envelope)
    await input.writeBack?.recordInFlight(createKey())

    const outcome = await gateway.cancel({
      command: {
        accessKey: cancellationInput.accessKey,
        authorizationProtocol: cancellationInput.authorizationProtocol,
        documentId: cancellationInput.documentId,
        justification: cancellationInput.justification,
        tenantId: cancellationInput.tenantId,
      },
      config: cancellationInput.config,
    })

    if (outcome.status === 'rejected') {
      const errorCode = outcome.rejection?.code ?? 'FISCAL_REJECTED'
      await input.writeBack?.recordCancellationRejected({ ...createKey(), errorCode })
      throw new CteIssuanceFatalError(errorCode)
    }

    if (outcome.status === 'error') {
      const cause = outcome.cause ?? 'cte cancellation failed in fiscal provider'
      await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
      throw new CteIssuanceRecoverableError(cause)
    }

    if (outcome.protocol === undefined) {
      throw new CteIssuanceFatalError('sefaz accepted the cancellation without a protocol')
    }

    const xml = await storeCancellationDocument({
      accessKey: cancellationInput.accessKey,
      companyId: envelope.companyId,
      eventXml: outcome.eventXml,
      logger: input.logger,
      ...(input.cancellationDocumentStorage === undefined
        ? {}
        : { storage: input.cancellationDocumentStorage }),
    })

    await input.writeBack?.recordCancelled({
      ...createKey(),
      accessKey: cancellationInput.accessKey,
      cancellationProtocol: outcome.protocol,
      ...(xml === undefined ? {} : { xml }),
    })

    safeLogInfo({
      logger: input.logger,
      message: 'cte_cancellation_worker_effect_cancelled',
      metadata: {
        attemptId: envelope.payload.attemptId,
        batchId: envelope.payload.batchId,
        batchItemId: envelope.payload.batchItemId,
        companyId: envelope.companyId,
        eventId: envelope.eventId,
        protocol: outcome.protocol,
      },
    })
  }

  return {
    async execute({ envelope }) {
      if (
        envelope.payload.status !== 'requested' &&
        envelope.payload.status !== 'retry_scheduled'
      ) {
        throw new CteIssuanceFatalError(`unsupported issuance status: ${envelope.payload.status}`)
      }

      if (envelope.payload.status === 'retry_scheduled') {
        safeLogInfo({
          logger: input.logger,
          message: 'cte_issuance_effect_skipped_retry_scheduled',
          metadata: {
            attemptId: envelope.payload.attemptId,
            batchId: envelope.payload.batchId,
            batchItemId: envelope.payload.batchItemId,
            companyId: envelope.companyId,
            eventId: envelope.eventId,
            status: envelope.payload.status,
          },
        })
        throw new CteIssuanceRecoverableError(
          'retry status should be requeued through outbox schedule',
        )
      }

      const isSettled = await input.settledAttemptGuard?.isSettled({
        attemptId: envelope.payload.attemptId,
        companyId: envelope.companyId,
      })
      if (isSettled === true) {
        safeLogInfo({
          logger: input.logger,
          message: 'cte_issuance_effect_skipped_settled_attempt',
          metadata: {
            attemptId: envelope.payload.attemptId,
            batchId: envelope.payload.batchId,
            batchItemId: envelope.payload.batchItemId,
            companyId: envelope.companyId,
            eventId: envelope.eventId,
          },
        })
        return
      }

      if (envelope.type === CTE_PROCESSING_EVENT_TYPE.ITEM_CANCEL_REQUESTED) {
        await executeCancellation(envelope)
        return
      }

      await executeIssuance(envelope)
    },
  }
}

/**
 * Só a duplicidade de numeração melhora com número novo; rejeição de conteúdo sondada seria
 * numeração queimada à toa. O teto de sondas mora no probe, que é quem conhece o histórico do item.
 */
async function advanceBurnedFiscalNumber(input: {
  readonly config: CteIssuanceExecutionInput['config']
  readonly errorCode: string
  readonly key: CteIssuanceWriteBackKey
  readonly logger: WorkerLogger
  readonly probe?: CteFiscalNumberProbe
}): Promise<boolean> {
  if (input.probe === undefined || !isFiscalNumberRejection(input.errorCode)) return false

  const result = await input.probe.advance({
    attemptId: input.key.attemptId,
    batchItemId: input.key.batchItemId,
    burnedNumber: input.config.numeroCte,
    companyId: input.key.companyId,
    environment: input.config.environment,
    occurredAt: input.key.occurredAt,
    rejectionCode: input.errorCode,
    series: input.config.serie,
  })

  safeLogInfo({
    logger: input.logger,
    message: 'cte_issuance_fiscal_number_probe',
    metadata: {
      attemptId: input.key.attemptId,
      batchItemId: input.key.batchItemId,
      burnedNumber: input.config.numeroCte,
      companyId: input.key.companyId,
      outcome: result.outcome,
      rejectionCode: input.errorCode,
      series: input.config.serie,
    },
  })

  return result.outcome === 'advanced'
}

function createWriteBackKey(envelope: CteProcessingEnvelopeV1): CteIssuanceWriteBackKey {
  return {
    attemptId: envelope.payload.attemptId,
    batchId: envelope.payload.batchId,
    batchItemId: envelope.payload.batchItemId,
    companyId: envelope.companyId,
    occurredAt: new Date(),
  }
}

function logPendingExecutionInput(input: {
  readonly envelope: CteProcessingEnvelopeV1
  readonly hasGateway: boolean
  readonly hasResolvedExecutionInput: boolean
  readonly logger: WorkerLogger
}): void {
  safeLogInfo({
    logger: input.logger,
    message: 'cte_issuance_worker_effect_pending_execution_input',
    metadata: {
      attemptId: input.envelope.payload.attemptId,
      attemptFingerprint: input.envelope.payload.attemptFingerprint,
      attemptKind: input.envelope.payload.attemptKind,
      batchId: input.envelope.payload.batchId,
      batchItemId: input.envelope.payload.batchItemId,
      companyId: input.envelope.companyId,
      eventId: input.envelope.eventId,
      hasGateway: input.hasGateway,
      hasResolvedExecutionInput: input.hasResolvedExecutionInput,
    },
  })
}

/** Nunca lança: o evento 110111 já foi homologado na SEFAZ, reprocessar duplicaria o cancelamento. */
async function storeCancellationDocument(input: {
  readonly accessKey: string
  readonly companyId: string
  readonly eventXml: string | undefined
  readonly logger: WorkerLogger
  readonly storage?: CteCancellationDocumentStorage
}): Promise<CteStoredXmlObject | undefined> {
  if (input.storage === undefined || input.eventXml === undefined) return undefined

  try {
    return await input.storage.storeCancellationXml({
      accessKey: input.accessKey,
      companyId: input.companyId,
      xml: input.eventXml,
    })
  } catch (error) {
    safeLogError({
      logger: input.logger,
      message: 'cte_cancellation_xml_storage_failed',
      metadata: {
        accessKey: input.accessKey,
        companyId: input.companyId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    return undefined
  }
}

/** Nunca lança: depois do CT-e autorizado na SEFAZ, falhar aqui provocaria reemissão duplicada. */
async function storeFiscalDocument(input: {
  readonly companyId: string
  readonly config: CteIssuanceExecutionInput['config']
  readonly logger: WorkerLogger
  readonly outcome: CteIssueOutcome
  readonly storage?: CteAuthorizedDocumentStorage
}): Promise<CteIssuanceFiscalDocument | undefined> {
  const { accessKey, authorizedXml, protocol } = input.outcome

  if (
    input.storage === undefined ||
    accessKey === undefined ||
    authorizedXml === undefined ||
    protocol === undefined
  ) {
    return undefined
  }

  try {
    const xml = await input.storage.storeAuthorizedXml({
      accessKey,
      companyId: input.companyId,
      xml: authorizedXml,
    })

    return {
      accessKey,
      authorizationProtocol: protocol,
      fiscalEnvironment: input.config.environment,
      fiscalNumber: BigInt(input.config.numeroCte),
      fiscalSeries: input.config.serie,
      xml,
    }
  } catch (error) {
    safeLogError({
      logger: input.logger,
      message: 'cte_issuance_authorized_xml_storage_failed',
      metadata: {
        accessKey,
        companyId: input.companyId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    return undefined
  }
}

export { CteIssuanceRecoverableError, CteIssuanceFatalError }
