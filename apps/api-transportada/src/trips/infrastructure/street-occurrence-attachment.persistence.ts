/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.5 (RF1d): a foto da ocorrência de rua passa a ter também a linha de
 * `trip_document_occurrence_attachments` — posição 1, sem miniatura, com a hora da ocorrência (a linha
 * do tempo usa o `created_at` do anexo como a hora do evento de foto). A coluna `attachment_object_id`
 * continua sendo gravada por quem chama, até a leitura nova estar em produção: escrita dupla.
 *
 * ⚠️ O lote do escritório chega aqui com o próprio objeto (`delivery_proof`), o mesmo nas N notas:
 * vira N linhas com o mesmo `stored_object_id`, e nenhum objeto `trip_occurrence_attachment` nasce
 * por ele (o expurgo da 161 supõe uma linha por objeto — plan § T1d.2).
 */
import { tripDocumentOccurrenceAttachments } from '../../database/trip.schema.js'
import type { TripQueryable } from './trip-queryable.type.js'

const STREET_ATTACHMENT_POSITION = 1

export async function mirrorStreetOccurrenceAttachment(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly createdAt: Date
    readonly occurrenceId: string
    readonly storedObjectId: string
  },
): Promise<void> {
  await queryable.insert(tripDocumentOccurrenceAttachments).values({
    companyId: input.companyId,
    createdAt: input.createdAt,
    occurrenceId: input.occurrenceId,
    position: STREET_ATTACHMENT_POSITION,
    storedObjectId: input.storedObjectId,
    thumbnailObjectId: null,
  })
}
