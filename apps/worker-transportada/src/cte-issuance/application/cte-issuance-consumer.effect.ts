/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
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

import type { CteCancellationExecutionInput } from './cte-cancellation-input-resolver.service.js'
import type { CteIssuanceExecutionInput } from './cte-issuance-execution-input-resolver.service.js'
import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from './cte-issuance-worker-message-handler.service.js'

type CteIssuanceWorkerEffect = {
  execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

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

export function createCteIssuanceWorkerEffect(input: {
  readonly authorizedDocumentStorage?: CteAuthorizedDocumentStorage
  readonly cancellationDocumentStorage?: CteCancellationDocumentStorage
  readonly createProvider?: (input: { readonly config: CteProviderConfig }) => CteFiscalProvider
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

  async function executeIssuance(envelope: CteProcessingEnvelopeV1): Promise<void> {
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

    const outcome = await gateway.issue({
      config: executionInput.config,
      command: {
        tenantId: executionInput.tenantId,
        documentId: executionInput.documentId,
        cteData: executionInput.cteData,
      },
    })

    if (outcome.status === 'rejected') {
      const errorCode = outcome.rejection?.code ?? 'FISCAL_REJECTED'
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
