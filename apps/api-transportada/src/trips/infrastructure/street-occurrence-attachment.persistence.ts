/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.5 (RF1d), T2.7: a foto da ocorrência de rua passa a ter também as linhas de
 * `trip_document_occurrence_attachments` — uma por foto, posições 1..N, sem miniatura, com a hora da
 * ocorrência (a linha do tempo usa o `created_at` do anexo como a hora do evento de foto). A coluna
 * `attachment_object_id` continua sendo gravada por quem chama, com a primeira, até a leitura nova estar
 * em produção: escrita dupla.
 *
 * ⚠️ O lote do escritório chega aqui com o próprio objeto (`delivery_proof`), o mesmo nas N notas:
 * vira N linhas com o mesmo `stored_object_id`, e nenhum objeto `trip_occurrence_attachment` nasce
 * por ele (o expurgo da 161 supõe uma linha por objeto — plan § T1d.2).
 */
import { tripDocumentOccurrenceAttachments } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

const FIRST_ATTACHMENT_POSITION = 1

export async function mirrorStreetOccurrenceAttachments(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly createdAt: Date
    readonly occurrenceId: string
    /** Na ordem em que o motorista as mandou; a posição é o índice mais um (a tabela aceita 1 a 5). */
    readonly storedObjectIds: readonly string[]
  },
): Promise<void> {
  await queryable.insert(tripDocumentOccurrenceAttachments).values(
    input.storedObjectIds.map((storedObjectId, index) => ({
      companyId: input.companyId,
      createdAt: input.createdAt,
      occurrenceId: input.occurrenceId,
      position: FIRST_ATTACHMENT_POSITION + index,
      storedObjectId,
      thumbnailObjectId: null,
    })),
  )
}
