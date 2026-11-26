/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D4/RF5: onde está a "NF X" que a leitura do canhoto apontou. Uma consulta só para todas
 * as provas da leitura, e **só** quando alguma diverge da própria nota: a leitura sem divergência
 * custa +0 consultas, como antes.
 *
 * ⚠️ Sempre pelo `companyId` da prova — o mesmo de toda a leitura, vindo do contexto autenticado —,
 * em cada tabela: a NF X de outra transportadora não existe para esta (RNF de isolamento da 344).
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  TRIP_DELIVERY_PROOF_CANHOTO_KIND,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../database/trip.schema.js'
import {
  compareCanhotoReading,
  pickCanhotoMismatchDocument,
  readEmitterTaxIdFromAccessKey,
  type CanhotoMismatch,
  type CanhotoMismatchCandidate,
  type CanhotoReadingComparisonInput,
} from '../domain/canhoto-mismatch.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O que a leitura da prova já tem em mãos para a comparação. */
export type CanhotoMismatchSubject = CanhotoReadingComparisonInput & {
  readonly expectedAccessKey: null | string
  readonly expectedNfeDocumentId: null | string
}

/**
 * Devolve, na mesma ordem de `subjects`, o alerta de cada prova (`null` quando não há o que dizer).
 */
export async function deriveCanhotoMismatches(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly subjects: readonly CanhotoMismatchSubject[]
    readonly tripId: string
  },
): Promise<readonly (CanhotoMismatch | null)[]> {
  const divergences = input.subjects.map((subject) => compareCanhotoReading(subject))
  const numbers = [
    ...new Set(divergences.flatMap((divergence) => (divergence ? [divergence.readNumber] : []))),
  ]
  if (numbers.length === 0) return divergences.map(() => null)

  const candidates = await findCanhotoMismatchCandidates(queryable, {
    companyId: input.companyId,
    numbers,
    tripId: input.tripId,
  })

  return divergences.map((divergence, index) => {
    if (divergence === null) return null
    const subject = input.subjects[index]
    return {
      ...divergence,
      matchedDocument: pickCanhotoMismatchDocument({
        candidates,
        currentTripId: input.tripId,
        divergence,
        expectedEmitterTaxId:
          subject?.expectedAccessKey === null || subject?.expectedAccessKey === undefined
            ? null
            : readEmitterTaxIdFromAccessKey(subject.expectedAccessKey),
        expectedNfeDocumentId: subject?.expectedNfeDocumentId ?? null,
      }),
    }
  })
}

/**
 * As notas da empresa com um dos números lidos, cada uma com **um** vínculo vivo no máximo (o desta
 * viagem, se houver) e a duplicidade da Q4: algum canhoto dela já aprovado, em qualquer viagem.
 *
 * O número é comparado sem zero à esquerda dos dois lados (`ltrim`): a CHECK da coluna aceita zero à
 * esquerda, e a leitura já chega normalizada.
 */
export async function findCanhotoMismatchCandidates(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly numbers: readonly string[]
    readonly tripId: string
  },
): Promise<readonly CanhotoMismatchCandidate[]> {
  if (input.numbers.length === 0) return []

  const rows = await queryable
    .select({
      accessKey: nfeDocuments.accessKey,
      canhotoApproved: sql<boolean>`exists (
        select 1
        from ${tripDeliveryProofs} as approved_proof
        inner join ${tripStopEvents} as approved_event
          on approved_event.company_id = approved_proof.company_id
          and approved_event.id = approved_proof.stop_event_id
        inner join ${tripDocuments} as approved_link
          on approved_link.company_id = approved_event.company_id
          and approved_link.id = approved_event.trip_document_id
        where approved_proof.company_id = ${input.companyId}
          and approved_link.nfe_document_id = ${nfeDocuments.id}
          and approved_proof.kind = ${TRIP_DELIVERY_PROOF_CANHOTO_KIND}
          and approved_proof.canhoto_review = 'approved'
      )`,
      nfeDocumentId: nfeDocuments.id,
      number: nfeDocuments.number,
      series: nfeDocuments.series,
      status: nfeDocuments.status,
      tripDocumentId: tripDocuments.id,
      tripId: tripDocuments.tripId,
    })
    .from(nfeDocuments)
    .leftJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, nfeDocuments.companyId),
        eq(tripDocuments.nfeDocumentId, nfeDocuments.id),
        isNull(tripDocuments.releasedAt),
      ),
    )
    .where(
      and(
        eq(nfeDocuments.companyId, input.companyId),
        inArray(sql<string>`ltrim(${nfeDocuments.number}, '0')`, [...input.numbers]),
      ),
    )

  const byDocument = new Map<string, CanhotoMismatchCandidate>()
  for (const row of rows) {
    const known = byDocument.get(row.nfeDocumentId)
    // A nota com vínculo nesta viagem vence; senão, o primeiro vínculo vivo; senão, nenhum.
    if (known !== undefined && (known.tripId === input.tripId || row.tripId === null)) continue
    if (known !== undefined && known.tripId !== null && row.tripId !== input.tripId) continue
    byDocument.set(row.nfeDocumentId, {
      canhotoApproved: Boolean(row.canhotoApproved),
      emitterTaxId: readEmitterTaxIdFromAccessKey(row.accessKey),
      nfeDocumentId: row.nfeDocumentId,
      number: row.number,
      series: row.series,
      status: row.status,
      tripDocumentId: row.tripDocumentId,
      tripId: row.tripId,
    })
  }

  return [...byDocument.values()]
}
