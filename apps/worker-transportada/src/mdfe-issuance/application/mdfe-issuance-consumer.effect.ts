/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  MDFE_PROCESSING_EVENT_TYPE,
  type MdfeProcessingEnvelopeV1,
} from '../../messaging/mdfe-processing-envelope.schema.js'
import type {
  MdfeEventOutcome,
  MdfeFiscalProvider,
  MdfeIssueOutcome,
  MdfeProviderConfig,
} from '../infrastructure/mdfe-fiscal-gateway.js'
import { createMdfeFiscalGateway } from '../infrastructure/mdfe-fiscal-gateway.js'

import type { MdfeIssuanceExecutionInput } from './mdfe-issuance-execution-input-resolver.service.js'
import {
  MdfeIssuanceFatalError,
  MdfeIssuanceRecoverableError,
} from './mdfe-issuance-worker-message-handler.service.js'

const DEFAULT_REJECTION_CODE = 'FISCAL_REJECTED'

type MdfeIssuanceWorkerEffect = {
  execute(params: { readonly envelope: MdfeProcessingEnvelopeV1 }): Promise<void>
}

export type MdfeIssuanceWriteBackKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly manifestId: string
  readonly occurredAt: Date
}

export type MdfeStoredXmlObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type MdfeEventName = 'cancellation' | 'closure'

export type MdfeAuthorizedDocumentStorage = {
  storeAuthorizedXml(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly xml: string
  }): Promise<MdfeStoredXmlObject>
}

export type MdfeEventDocumentStorage = {
  storeEventXml(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly eventName: MdfeEventName
    readonly xml: string
  }): Promise<MdfeStoredXmlObject>
}

export type MdfeIssuanceFiscalDocument = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly fiscalEnvironment: 'homologation' | 'production'
  readonly fiscalNumber: bigint
  readonly fiscalSeries: string
  readonly xml: MdfeStoredXmlObject
}

export type MdfeClosureExecutionInput = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly closureCityCode: string
  readonly closureDate: string
  readonly closureState: string
  readonly config: MdfeIssuanceExecutionInput['config']
  readonly manifestId: string
  readonly tenantId: string
}

export type MdfeCancellationExecutionInput = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly config: MdfeIssuanceExecutionInput['config']
  readonly justification: string
  readonly manifestId: string
  readonly tenantId: string
}

export type MdfeIssuanceWriteBack = {
  recordAuthorized(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey?: string
      readonly fiscalDocument?: MdfeIssuanceFiscalDocument
      readonly protocol?: string
    },
  ): Promise<void>
  recordCancellationRejected(
    input: MdfeIssuanceWriteBackKey & { readonly errorCode: string },
  ): Promise<void>
  recordCancelled(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly cancellationProtocol: string
      readonly xml?: MdfeStoredXmlObject
    },
  ): Promise<void>
  recordClosed(
    input: MdfeIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly closureCityCode: string
      readonly closureProtocol: string
      readonly closureState: string
      readonly xml?: MdfeStoredXmlObject
    },
  ): Promise<void>
  recordClosureRejected(
    input: MdfeIssuanceWriteBackKey & { readonly errorCode: string },
  ): Promise<void>
  recordInFlight(input: MdfeIssuanceWriteBackKey): Promise<void>
  recordRejected(input: MdfeIssuanceWriteBackKey & { readonly errorCode: string }): Promise<void>
  recordRetryScheduled(input: MdfeIssuanceWriteBackKey & { readonly cause: string }): Promise<void>
}

export type MdfeSettledAttemptGuard = {
  isSettled(input: { readonly attemptId: string; readonly companyId: string }): Promise<boolean>
}

type MdfeIssuanceWorkerEffectDependencies = {
  readonly authorizedDocumentStorage?: MdfeAuthorizedDocumentStorage
  readonly createProvider?: (input: { readonly config: MdfeProviderConfig }) => MdfeFiscalProvider
  readonly eventDocumentStorage?: MdfeEventDocumentStorage
  readonly logger: WorkerLogger
  readonly resolveCancellationInput?: (params: {
    readonly envelope: MdfeProcessingEnvelopeV1
  }) => Promise<MdfeCancellationExecutionInput | null>
  readonly resolveClosureInput?: (params: {
    readonly envelope: MdfeProcessingEnvelopeV1
  }) => Promise<MdfeClosureExecutionInput | null>
  readonly resolveExecutionInput?: (params: {
    readonly envelope: MdfeProcessingEnvelopeV1
  }) => Promise<MdfeIssuanceExecutionInput | null>
  readonly settledAttemptGuard?: MdfeSettledAttemptGuard
  readonly writeBack?: MdfeIssuanceWriteBack
}

export function createMdfeIssuanceWorkerEffect(
  input: MdfeIssuanceWorkerEffectDependencies,
): MdfeIssuanceWorkerEffect {
  const gateway =
    input.createProvider === undefined
      ? null
      : createMdfeFiscalGateway({ createProvider: input.createProvider })

  async function executeIssuance(envelope: MdfeProcessingEnvelopeV1): Promise<void> {
    const executionInput =
      input.resolveExecutionInput === undefined
        ? null
        : await input.resolveExecutionInput({ envelope })

    if (executionInput === null || gateway === null) {
      logPendingExecutionInput({ envelope, hasGateway: gateway !== null, logger: input.logger })
      return
    }

    const createKey = (): MdfeIssuanceWriteBackKey => createWriteBackKey(envelope)
    await input.writeBack?.recordInFlight(createKey())

    const outcome = await gateway.issue({
      command: {
        manifestId: executionInput.manifestId,
        mdfeData: executionInput.mdfeData,
        tenantId: executionInput.tenantId,
      },
      config: executionInput.config,
    })

    if (outcome.status === 'rejected') {
      const errorCode = outcome.rejection?.code ?? DEFAULT_REJECTION_CODE
      await input.writeBack?.recordRejected({ ...createKey(), errorCode })
      throw new MdfeIssuanceFatalError(errorCode)
    }

    if (outcome.status === 'error') {
      const cause = outcome.cause ?? 'mdfe issuance failed in fiscal provider'
      await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
      throw new MdfeIssuanceRecoverableError(cause)
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

    logSettledEvent({
      envelope,
      logger: input.logger,
      name: 'authorized',
      protocol: outcome.protocol,
    })
  }

  async function executeClosure(envelope: MdfeProcessingEnvelopeV1): Promise<void> {
    const closureInput =
      input.resolveClosureInput === undefined ? null : await input.resolveClosureInput({ envelope })

    if (closureInput === null || gateway === null) {
      logPendingExecutionInput({ envelope, hasGateway: gateway !== null, logger: input.logger })
      return
    }

    const createKey = (): MdfeIssuanceWriteBackKey => createWriteBackKey(envelope)
    await input.writeBack?.recordInFlight(createKey())

    const outcome = await gateway.close({
      command: {
        accessKey: closureInput.accessKey,
        authorizationProtocol: closureInput.authorizationProtocol,
        closureCityCode: closureInput.closureCityCode,
        closureDate: closureInput.closureDate,
        closureState: closureInput.closureState,
        manifestId: closureInput.manifestId,
        tenantId: closureInput.tenantId,
      },
      config: closureInput.config,
    })

    const protocol = await guardEventOutcome({
      envelope,
      onRejected: async (errorCode) => {
        await input.writeBack?.recordClosureRejected({ ...createKey(), errorCode })
      },
      onRetryScheduled: async (cause) => {
        await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
      },
      outcome,
      settledWithoutProtocol: 'sefaz accepted the closure without a protocol',
    })

    const xml = await storeEventDocument({
      accessKey: closureInput.accessKey,
      companyId: envelope.companyId,
      eventName: 'closure',
      eventXml: outcome.eventXml,
      logger: input.logger,
      ...(input.eventDocumentStorage === undefined ? {} : { storage: input.eventDocumentStorage }),
    })

    await input.writeBack?.recordClosed({
      ...createKey(),
      accessKey: closureInput.accessKey,
      closureCityCode: closureInput.closureCityCode,
      closureProtocol: protocol,
      closureState: closureInput.closureState,
      ...(xml === undefined ? {} : { xml }),
    })

    logSettledEvent({ envelope, logger: input.logger, name: 'closed', protocol })
  }

  async function executeCancellation(envelope: MdfeProcessingEnvelopeV1): Promise<void> {
    const cancellationInput =
      input.resolveCancellationInput === undefined
        ? null
        : await input.resolveCancellationInput({ envelope })

    if (cancellationInput === null || gateway === null) {
      logPendingExecutionInput({ envelope, hasGateway: gateway !== null, logger: input.logger })
      return
    }

    const createKey = (): MdfeIssuanceWriteBackKey => createWriteBackKey(envelope)
    await input.writeBack?.recordInFlight(createKey())

    const outcome = await gateway.cancel({
      command: {
        accessKey: cancellationInput.accessKey,
        authorizationProtocol: cancellationInput.authorizationProtocol,
        justification: cancellationInput.justification,
        manifestId: cancellationInput.manifestId,
        tenantId: cancellationInput.tenantId,
      },
      config: cancellationInput.config,
    })

    const protocol = await guardEventOutcome({
      envelope,
      onRejected: async (errorCode) => {
        await input.writeBack?.recordCancellationRejected({ ...createKey(), errorCode })
      },
      onRetryScheduled: async (cause) => {
        await input.writeBack?.recordRetryScheduled({ ...createKey(), cause })
      },
      outcome,
      settledWithoutProtocol: 'sefaz accepted the cancellation without a protocol',
    })

    const xml = await storeEventDocument({
      accessKey: cancellationInput.accessKey,
      companyId: envelope.companyId,
      eventName: 'cancellation',
      eventXml: outcome.eventXml,
      logger: input.logger,
      ...(input.eventDocumentStorage === undefined ? {} : { storage: input.eventDocumentStorage }),
    })

    await input.writeBack?.recordCancelled({
      ...createKey(),
      accessKey: cancellationInput.accessKey,
      cancellationProtocol: protocol,
      ...(xml === undefined ? {} : { xml }),
    })

    logSettledEvent({ envelope, logger: input.logger, name: 'cancelled', protocol })
  }

  return {
    async execute({ envelope }) {
      if (
        envelope.payload.status !== 'requested' &&
        envelope.payload.status !== 'retry_scheduled'
      ) {
        throw new MdfeIssuanceFatalError(`unsupported issuance status: ${envelope.payload.status}`)
      }

      if (envelope.payload.status === 'retry_scheduled') {
        throw new MdfeIssuanceRecoverableError(
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
          message: 'mdfe_issuance_effect_skipped_settled_attempt',
          metadata: {
            attemptId: envelope.payload.attemptId,
            companyId: envelope.companyId,
            eventId: envelope.eventId,
            manifestId: envelope.payload.manifestId,
          },
        })
        return
      }

      if (envelope.type === MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED) {
        await executeClosure(envelope)
        return
      }

      if (envelope.type === MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED) {
        await executeCancellation(envelope)
        return
      }

      await executeIssuance(envelope)
    },
  }
}

async function guardEventOutcome(input: {
  readonly envelope: MdfeProcessingEnvelopeV1
  onRejected(errorCode: string): Promise<void>
  onRetryScheduled(cause: string): Promise<void>
  readonly outcome: MdfeEventOutcome
  readonly settledWithoutProtocol: string
}): Promise<string> {
  if (input.outcome.status === 'rejected') {
    const errorCode = input.outcome.rejection?.code ?? DEFAULT_REJECTION_CODE
    await input.onRejected(errorCode)
    throw new MdfeIssuanceFatalError(errorCode)
  }

  if (input.outcome.status === 'error') {
    const cause = input.outcome.cause ?? 'mdfe event failed in fiscal provider'
    await input.onRetryScheduled(cause)
    throw new MdfeIssuanceRecoverableError(cause)
  }

  if (input.outcome.protocol === undefined) {
    throw new MdfeIssuanceFatalError(input.settledWithoutProtocol)
  }

  return input.outcome.protocol
}

function createWriteBackKey(envelope: MdfeProcessingEnvelopeV1): MdfeIssuanceWriteBackKey {
  return {
    attemptId: envelope.payload.attemptId,
    companyId: envelope.companyId,
    manifestId: envelope.payload.manifestId,
    occurredAt: new Date(),
  }
}

function logSettledEvent(input: {
  readonly envelope: MdfeProcessingEnvelopeV1
  readonly logger: WorkerLogger
  readonly name: string
  readonly protocol: string | undefined
}): void {
  safeLogInfo({
    logger: input.logger,
    message: `mdfe_issuance_worker_effect_${input.name}`,
    metadata: {
      attemptId: input.envelope.payload.attemptId,
      attemptKind: input.envelope.payload.attemptKind,
      companyId: input.envelope.companyId,
      eventId: input.envelope.eventId,
      manifestId: input.envelope.payload.manifestId,
      protocol: input.protocol,
    },
  })
}

function logPendingExecutionInput(input: {
  readonly envelope: MdfeProcessingEnvelopeV1
  readonly hasGateway: boolean
  readonly logger: WorkerLogger
}): void {
  safeLogInfo({
    logger: input.logger,
    message: 'mdfe_issuance_worker_effect_pending_execution_input',
    metadata: {
      attemptId: input.envelope.payload.attemptId,
      attemptKind: input.envelope.payload.attemptKind,
      companyId: input.envelope.companyId,
      eventId: input.envelope.eventId,
      hasGateway: input.hasGateway,
      manifestId: input.envelope.payload.manifestId,
    },
  })
}

/** Nunca lança: o evento já foi homologado na SEFAZ, reprocessar duplicaria o evento fiscal. */
async function storeEventDocument(input: {
  readonly accessKey: string
  readonly companyId: string
  readonly eventName: MdfeEventName
  readonly eventXml: string | undefined
  readonly logger: WorkerLogger
  readonly storage?: MdfeEventDocumentStorage
}): Promise<MdfeStoredXmlObject | undefined> {
  if (input.storage === undefined || input.eventXml === undefined) return undefined

  try {
    return await input.storage.storeEventXml({
      accessKey: input.accessKey,
      companyId: input.companyId,
      eventName: input.eventName,
      xml: input.eventXml,
    })
  } catch (error) {
    safeLogError({
      logger: input.logger,
      message: 'mdfe_event_xml_storage_failed',
      metadata: {
        accessKey: input.accessKey,
        companyId: input.companyId,
        eventName: input.eventName,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    return undefined
  }
}

/** Nunca lança: depois do MDF-e autorizado na SEFAZ, falhar aqui provocaria reemissão duplicada. */
async function storeFiscalDocument(input: {
  readonly companyId: string
  readonly config: MdfeIssuanceExecutionInput['config']
  readonly logger: WorkerLogger
  readonly outcome: MdfeIssueOutcome
  readonly storage?: MdfeAuthorizedDocumentStorage
}): Promise<MdfeIssuanceFiscalDocument | undefined> {
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
      fiscalNumber: BigInt(input.config.numeroMdfe),
      fiscalSeries: input.config.serie,
      xml,
    }
  } catch (error) {
    safeLogError({
      logger: input.logger,
      message: 'mdfe_issuance_authorized_xml_storage_failed',
      metadata: {
        accessKey,
        companyId: input.companyId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
    return undefined
  }
}

export { MdfeIssuanceFatalError, MdfeIssuanceRecoverableError }
