/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T303/T304 (RF6, RF7, RF8): cancela com motivo, nunca apaga. A mesma transação que lê a
 * tratativa é quem escreve — ver o comentário de `occurrence-correction.port.ts`.
 */
import { resolveOccurrenceCancellationReason } from '../domain/occurrence-cancellation.policy.js'
import {
  OccurrenceAlreadyCancelledError,
  OccurrenceCaseAlreadyOpenError,
  TripOccurrenceNotFoundError,
} from '../domain/trip.error.js'
import type {
  CorrectedOccurrenceView,
  OccurrenceCorrectionUnitOfWork,
} from './occurrence-correction.port.js'

export type CancelOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly occurrenceId: string
  readonly reason: string
  readonly unitOfWork: OccurrenceCorrectionUnitOfWork
}

/** RF7: a ocorrência cancelada some da contagem, da listagem de ativas, do e-mail e da tratativa — ver `readOccurrenceView`/os pontos de leitura em `T304`. */
export async function cancelOccurrence(
  input: CancelOccurrenceInput,
): Promise<CorrectedOccurrenceView> {
  /** Validação pura, fora da transação — não depende de banco. */
  const reason = resolveOccurrenceCancellationReason(input.reason)

  return input.unitOfWork.execute(async (transaction) => {
    const occurrence = await transaction.lockOccurrence({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })
    if (occurrence === null) throw new TripOccurrenceNotFoundError()
    /** RF6/CA07: cancelar duas vezes é 409, nunca 204 silencioso. */
    if (occurrence.cancelledAt !== null) throw new OccurrenceAlreadyCancelledError()
    /** RF8/CA06: mesma janela de RF4 — a tratativa já abriu, o número já vale dinheiro. */
    if (
      await transaction.hasOpenCase({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
    ) {
      throw new OccurrenceCaseAlreadyOpenError()
    }

    await transaction.writeCancellation({
      cancelledByUserId: input.actorUserId,
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      reason,
    })

    return transaction.readOccurrenceView({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
    })
  })
}
