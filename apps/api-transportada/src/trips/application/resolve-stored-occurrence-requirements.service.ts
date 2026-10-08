/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b): a exigência **efetiva** de uma ocorrência que já existe — correção e detalhe do
 * escritório. É a mesma resolução do registro (`resolveDocumentOccurrenceRequirements`), só que o tipo
 * pode ter sido desativado ou trocado de momento depois do registro, e isso não pode travar a leitura
 * nem a correção: a ocorrência antiga continua valendo, então o filtro de "tipo ativo do momento"
 * da lista do motorista não se aplica aqui.
 */
import { OCCURRENCE_MOMENT } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceRequirements } from '../domain/occurrence-requirements.policy.js'
import {
  resolveDocumentOccurrenceRequirements,
  type ResolveDocumentOccurrenceRequirementsParams,
} from './resolve-document-occurrence-requirements.service.js'

export function resolveStoredOccurrenceRequirements(
  params: ResolveDocumentOccurrenceRequirementsParams,
): Promise<OccurrenceRequirements> {
  return resolveDocumentOccurrenceRequirements({
    ...params,
    occurrenceType: {
      ...params.occurrenceType,
      active: true,
      moments: [OCCURRENCE_MOMENT.document],
    },
  })
}
