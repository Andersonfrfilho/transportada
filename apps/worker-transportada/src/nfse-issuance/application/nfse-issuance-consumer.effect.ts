/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseProcessingEnvelopeV1 } from '../../messaging/nfse-processing-envelope.schema.js'
import type {
  NfseCredentialAccess,
  NfseFiscalGateway,
} from '../infrastructure/nfse-fiscal-gateway.js'
import { NfseIssuanceFatalError, NfseIssuanceRecoverableError } from './nfse-issuance.error.js'

const CANCEL_ATTEMPT_KIND = 'cancel'
const DEFAULT_CAUSE = 'transport_failure'
const MISSING_CANCELLATION_REASON = 'missing_cancellation_reason'
const MISSING_PROVIDER_DOCUMENT = 'missing_provider_document'
const REJECTED_CAUSE = 'rejected'
const UNKNOWN_REJECTION_CODE = 'NFSE_UNKNOWN'

export type NfseIssuanceWriteBackKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly invoiceId: string
  readonly occurredAt: Date
}

/**
 * O que o banco entrega na hora de transmitir. O motivo do cancelamento é lido daqui, e não do
 * envelope: ele é texto livre do operador e não atravessa o broker (`security.md` §6).
 */
export type NfseIssuanceExecutionInput = {
  readonly cancellationReason?: string
  readonly credential: NfseCredentialAccess
  readonly payload: unknown
  readonly providerDocumentId?: string
}

export type NfseIssuanceExecutionInputReader = {
  load(input: {
    readonly attemptId: string
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<NfseIssuanceExecutionInput | undefined>
}

export type NfseIssuanceWriteBack = {
  recordAccepted(
    input: NfseIssuanceWriteBackKey & { readonly providerDocumentId?: string },
  ): Promise<void>
  recordCancellationConfirmed(input: NfseIssuanceWriteBackKey): Promise<void>
  recordInFlight(input: NfseIssuanceWriteBackKey): Promise<void>
  recordRejected(
    input: NfseIssuanceWriteBackKey & {
      readonly errorCode: string
      readonly errorMessage?: string
    },
  ): Promise<void>
  recordRetryScheduled(input: NfseIssuanceWriteBackKey & { readonly cause: string }): Promise<void>
}

export type NfseIssuanceGateway = Pick<NfseFiscalGateway, 'cancel' | 'issue'>

export type NfseIssuanceConsumerEffect = {
  execute(input: { readonly envelope: NfseProcessingEnvelopeV1 }): Promise<void>
}

export function createNfseIssuanceWorkerEffect(dependencies: {
  readonly clock?: () => Date
  readonly executionInput: NfseIssuanceExecutionInputReader
  readonly gateway: NfseIssuanceGateway
  readonly writeBack: NfseIssuanceWriteBack
}): NfseIssuanceConsumerEffect {
  const { executionInput, gateway, writeBack } = dependencies
  const clock = dependencies.clock ?? ((): Date => new Date())

  async function issue(input: {
    readonly execution: NfseIssuanceExecutionInput
    readonly key: NfseIssuanceWriteBackKey
  }): Promise<void> {
    await writeBack.recordInFlight(input.key)

    const outcome = await gateway.issue({
      credential: input.execution.credential,
      payload: input.execution.payload,
    })

    if (outcome.status === 'accepted') {
      await writeBack.recordAccepted({
        ...input.key,
        ...(outcome.providerDocumentId === undefined
          ? {}
          : { providerDocumentId: outcome.providerDocumentId }),
      })
      return
    }

    if (outcome.status === 'rejected') {
      /** A recusa fica na linha da tentativa: só o código não explica ao operador o que corrigir. */
      await writeBack.recordRejected({
        ...input.key,
        errorCode: outcome.rejection?.code ?? UNKNOWN_REJECTION_CODE,
        ...(outcome.rejection?.message === undefined
          ? {}
          : { errorMessage: outcome.rejection.message }),
      })
      throw new NfseIssuanceFatalError(REJECTED_CAUSE)
    }

    const cause = outcome.cause ?? DEFAULT_CAUSE
    await writeBack.recordRetryScheduled({ ...input.key, cause })
    throw new NfseIssuanceRecoverableError(cause)
  }

  async function cancel(input: {
    readonly execution: NfseIssuanceExecutionInput
    readonly key: NfseIssuanceWriteBackKey
  }): Promise<void> {
    const { cancellationReason, credential, providerDocumentId } = input.execution

    if (providerDocumentId === undefined || providerDocumentId === '') {
      throw new NfseIssuanceFatalError(MISSING_PROVIDER_DOCUMENT)
    }
    if (cancellationReason === undefined || cancellationReason === '') {
      throw new NfseIssuanceFatalError(MISSING_CANCELLATION_REASON)
    }

    await writeBack.recordInFlight(input.key)

    const outcome = await gateway.cancel({
      credential,
      providerDocumentId,
      reason: cancellationReason,
    })

    if (outcome.status === 'accepted') {
      await writeBack.recordCancellationConfirmed(input.key)
      return
    }

    if (outcome.status === 'rejected') {
      await writeBack.recordRejected({
        ...input.key,
        errorCode: outcome.rejection?.code ?? UNKNOWN_REJECTION_CODE,
        ...(outcome.rejection?.message === undefined
          ? {}
          : { errorMessage: outcome.rejection.message }),
      })
      throw new NfseIssuanceFatalError(REJECTED_CAUSE)
    }

    const cause = outcome.cause ?? DEFAULT_CAUSE
    await writeBack.recordRetryScheduled({ ...input.key, cause })
    throw new NfseIssuanceRecoverableError(cause)
  }

  return {
    execute: async ({ envelope }) => {
      const key = {
        attemptId: envelope.payload.attemptId,
        companyId: envelope.companyId,
        invoiceId: envelope.payload.invoiceId,
        occurredAt: clock(),
      }

      const execution = await executionInput.load({
        attemptId: key.attemptId,
        companyId: key.companyId,
        invoiceId: key.invoiceId,
      })

      /** Tentativa já liquidada ou linha que sumiu: nada a transmitir, e nada a escrever. */
      if (execution === undefined) return

      if (envelope.payload.attemptKind === CANCEL_ATTEMPT_KIND) {
        await cancel({ execution, key })
        return
      }

      await issue({ execution, key })
    },
  }
}
