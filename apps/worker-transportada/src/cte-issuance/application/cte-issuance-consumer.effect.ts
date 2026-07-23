/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { CteProcessingEnvelopeV1 } from '../../messaging/cte-processing-envelope.schema.js'
import type { CteFiscalProvider } from '../infrastructure/cte-fiscal-gateway.js'
import { createCteFiscalGateway } from '../infrastructure/cte-fiscal-gateway.js'

import {
  CteIssuanceFatalError,
  CteIssuanceRecoverableError,
} from './cte-issuance-worker-message-handler.service.js'

type CteIssuanceExecutionInput = {
  readonly config: {
    readonly environment: 'homologation' | 'production'
    readonly cnpj: string
    readonly certificadoBase64: string
    readonly certificadoSenha: string
    readonly uf: string
  }
  readonly documentId: string
  readonly tenantId: string
  readonly cteData: unknown
}

type CteIssuanceWorkerEffect = {
  execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
}

export function createCteIssuanceWorkerEffect(input: {
  readonly createProvider?: (input: {
    readonly config: {
      readonly model: 'cte'
      readonly environment: 'homologacao' | 'producao'
      readonly cnpj: string
      readonly certificadoBase64: string
      readonly certificadoSenha: string
      readonly uf: string
      readonly bairro: string
      readonly cep: string
      readonly codigoMunicipio: string
      readonly crt: string
      readonly inscricaoEstadual: string
      readonly logradouro: string
      readonly municipio: string
      readonly numero: string
      readonly numeroCte: number
      readonly razaoSocial: string
      readonly rntrc: string
      readonly serie: string
    }
  }) => CteFiscalProvider
  readonly logger: WorkerLogger
  readonly resolveExecutionInput?: (params: {
    readonly envelope: CteProcessingEnvelopeV1
  }) => Promise<CteIssuanceExecutionInput | null>
}): CteIssuanceWorkerEffect {
  const gateway =
    input.createProvider === undefined
      ? null
      : createCteFiscalGateway({
          createProvider: input.createProvider,
        })

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

      const executionInput =
        input.resolveExecutionInput === undefined
          ? null
          : await input.resolveExecutionInput({ envelope })

      if (executionInput !== null && gateway !== null) {
        const outcome = await gateway.issue({
          config: executionInput.config,
          command: {
            tenantId: executionInput.tenantId,
            documentId: executionInput.documentId,
            cteData: executionInput.cteData,
          },
        })

        if (outcome.status === 'rejected') {
          throw new CteIssuanceFatalError(
            outcome.rejection?.code ?? 'cte issuance rejected by fiscal provider',
          )
        }

        if (outcome.status === 'error') {
          throw new CteIssuanceRecoverableError(
            outcome.cause ?? 'cte issuance failed in fiscal provider',
          )
        }

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
        return
      }

      safeLogInfo({
        logger: input.logger,
        message: 'cte_issuance_worker_effect_pending_execution_input',
        metadata: {
          attemptId: envelope.payload.attemptId,
          attemptFingerprint: envelope.payload.attemptFingerprint,
          attemptKind: envelope.payload.attemptKind,
          batchId: envelope.payload.batchId,
          batchItemId: envelope.payload.batchItemId,
          companyId: envelope.companyId,
          eventId: envelope.eventId,
          hasGateway: gateway !== null,
          hasResolvedExecutionInput: executionInput !== null,
        },
      })
    },
  }
}

export { CteIssuanceRecoverableError, CteIssuanceFatalError }
