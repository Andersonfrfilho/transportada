/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E13): o escritório registra o comprovante da transferência ao motorista **sem concluir** a ocorrência.
 * O arquivo já foi enviado ao motorista pelo chat da ocorrência; aqui só se grava qual anexo é o comprovante (o mesmo
 * que a conclusão grava) — a ocorrência de parada paga pelo motorista, desta empresa, e um anexo de mensagem
 * **enviada** na conversa do motorista **desta** ocorrência.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'
import {
  StopOccurrencePayoutNotApplicableError,
  StopOccurrencePayoutReceiptNotFoundError,
} from '../domain/receiving-charge.error.js'
import type { OccurrenceResolutionUnitOfWork } from './occurrence-resolution.port.js'

export type RecordDriverPayoutReceiptCommand = {
  readonly attachmentId: string
  readonly context: CompanyContext
  readonly occurrenceId: string
}

export type RecordDriverPayoutReceiptUseCase = {
  readonly execute: (
    input: RecordDriverPayoutReceiptCommand,
  ) => Promise<{ readonly sentAt: string }>
}

export function createRecordDriverPayoutReceiptUseCase(dependencies: {
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly unitOfWork: OccurrenceResolutionUnitOfWork
}): RecordDriverPayoutReceiptUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    async execute(input) {
      const target = {
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
        occurrenceKind: 'stop',
      } as const
      await dependencies.unitOfWork.execute(async (transaction) => {
        if ((await transaction.lockOccurrence(target)) === undefined) {
          throw new TripOccurrenceNotFoundError()
        }
        const outcome = await transaction.recordDriverPayoutReceipt({
          actorUserId: input.context.userId,
          attachmentId: input.attachmentId,
          companyId: input.context.companyId,
          occurrenceId: input.occurrenceId,
        })
        if (outcome === 'not_found') throw new StopOccurrencePayoutReceiptNotFoundError()
        if (outcome === 'not_driver_paid') throw new StopOccurrencePayoutNotApplicableError()
      })
      dependencies.logger.info('occurrence.driver-payout-receipt.recorded', {
        actorUserId: input.context.userId,
        occurrenceId: input.occurrenceId,
      })
      return { sentAt: now().toISOString() }
    },
  }
}
