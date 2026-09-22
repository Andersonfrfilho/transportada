/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14a: `GET /trip-occurrences/:id/case/redelivery-proposal` (RF17) — só leitura. Lê o
 * documento da ocorrência e a viagem, monta o contexto de `resolveRedeliveryProposal`
 * (`redelivery-proposal.policy.ts`, pura) e devolve a proposta. Nenhuma escrita em `trip_stops` ou
 * `trip_documents` — provado por contrato de regressão (T14a).
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { resolveRedeliveryProposal } from '../domain/redelivery-proposal.policy.js'
import type { RedeliveryProposal } from '../domain/redelivery-proposal.policy.js'
import { OccurrenceCaseNotFoundError } from '../domain/trip.error.js'

export type RedeliveryProposalOccurrenceDocument = {
  readonly releasedAt: Date | null
  readonly stopId: string | null
  readonly tripDocumentId: string
  readonly tripId: string
}

export type RedeliveryProposalPort = {
  /** Notas vivas (`released_at is null`) na mesma parada, sem contar a própria nota. */
  countOtherLiveDocumentsAtStop(input: {
    readonly companyId: string
    readonly excludingTripDocumentId: string
    readonly stopId: string
  }): Promise<number>
  /** `null` quando a ocorrência não existe nesta empresa. */
  readOccurrenceDocument(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<RedeliveryProposalOccurrenceDocument | null>
  /** Todas as paradas da viagem, na ordem atual de `sequence`. */
  readTripStopIds(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly string[]>
  /** `null` quando a viagem não existe nesta empresa. */
  readTripStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null>
}

export type GetRedeliveryProposalInput = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly repository: RedeliveryProposalPort
}

export async function getRedeliveryProposal(
  input: GetRedeliveryProposalInput,
): Promise<RedeliveryProposal> {
  const { companyId, occurrenceId, repository } = input

  const document = await repository.readOccurrenceDocument({ companyId, occurrenceId })
  if (document === null) throw new OccurrenceCaseNotFoundError()

  const tripStatus = await repository.readTripStatus({ companyId, tripId: document.tripId })
  if (tripStatus === null) throw new OccurrenceCaseNotFoundError()

  const [currentStopIds, otherLiveDocumentsAtStop] = await Promise.all([
    document.stopId === null
      ? Promise.resolve<readonly string[]>([])
      : repository.readTripStopIds({ companyId, tripId: document.tripId }),
    document.stopId === null
      ? Promise.resolve(0)
      : repository.countOtherLiveDocumentsAtStop({
          companyId,
          excludingTripDocumentId: document.tripDocumentId,
          stopId: document.stopId,
        }),
  ])

  return resolveRedeliveryProposal({
    currentStopIds,
    documentReleased: document.releasedAt !== null,
    otherLiveDocumentsAtStop,
    stopId: document.stopId,
    tripStatus,
  })
}
