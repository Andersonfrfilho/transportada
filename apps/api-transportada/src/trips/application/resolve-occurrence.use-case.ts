/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o escritório resolve a ocorrência com uma observação. O estado é lido depois do
 * lock da linha da ocorrência, dentro da mesma transação do insert: duas resoluções simultâneas
 * serializam e a segunda recebe 409.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { resolveOccurrenceResolutionState } from '../domain/occurrence-resolution.policy.js'
import { OccurrenceAlreadyResolvedError } from '../domain/occurrence-resolution.error.js'
import { OccurrenceCancelledError, TripOccurrenceNotFoundError } from '../domain/trip.error.js'
import type {
  OccurrenceKind,
  OccurrenceResolutionUnitOfWork,
} from './occurrence-resolution.port.js'

export type ResolveOccurrenceInput = {
  readonly context: CompanyContext
  readonly note: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

export type ResolveOccurrenceResult = {
  readonly note: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
  readonly resolvedAt: string
  readonly state: 'resolved'
}

export type ResolveOccurrenceUseCase = {
  readonly execute: (input: ResolveOccurrenceInput) => Promise<ResolveOccurrenceResult>
}

export type ResolveOccurrenceDependencies = {
  readonly logger: ApiLogger
  readonly unitOfWork: OccurrenceResolutionUnitOfWork
}

export function createResolveOccurrenceUseCase(
  dependencies: ResolveOccurrenceDependencies,
): ResolveOccurrenceUseCase {
  return {
    async execute(input) {
      const target = {
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
        occurrenceKind: input.occurrenceKind,
      }
      const inserted = await dependencies.unitOfWork.execute(async (transaction) => {
        const locked = await transaction.lockOccurrence(target)
        if (locked === undefined) throw new TripOccurrenceNotFoundError()

        const current = resolveOccurrenceResolutionState({
          cancelledAt: locked.cancelledAt,
          events: await transaction.listLatestEvents(target),
        })
        if (current.state === 'cancelled') throw new OccurrenceCancelledError()
        if (current.state === 'resolved') throw new OccurrenceAlreadyResolvedError()

        return transaction.insertInternalResolution({
          ...target,
          actorUserId: input.context.userId,
          note: input.note,
        })
      })

      dependencies.logger.info('occurrence.resolution.resolved', {
        actorKind: 'internal',
        occurrenceId: input.occurrenceId,
        occurrenceKind: input.occurrenceKind,
      })
      return {
        note: input.note,
        occurrenceId: input.occurrenceId,
        occurrenceKind: input.occurrenceKind,
        resolvedAt: inserted.createdAt,
        state: 'resolved',
      }
    },
  }
}
