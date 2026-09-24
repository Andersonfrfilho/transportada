/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Defeito medido em 21/09/2026: `company_occurrence_types` está vazia em staging e produção, e a
 * migration que a criou (`drizzle/20260903140000_company_occurrence_types/migration.sql`) nunca
 * levou este catálogo para o banco. Sem ele, nenhuma tela oferece tipo para registrar ocorrência —
 * o `PUT /company-settings/occurrence-types` existe, mas não tem consumidor no frontend. Este
 * catálogo é o texto de **bootstrap** que `occurrence-type-catalog-seed.service.ts` grava só para
 * empresa sem nenhum tipo cadastrado (ver o porquê no comentário de `seedOccurrenceTypeCatalog`).
 */
import { TRIP_OCCURRENCE_TYPES, type TripOccurrenceStage } from './trip-occurrence.constant.js'

export type OccurrenceTypeCatalogEntry = {
  readonly name: string
  readonly stage: TripOccurrenceStage
}

const OCCURRENCE_TYPE_LABEL: Readonly<Record<string, string>> = {
  avaria_transporte: 'Avaria no transporte',
  destinatario_ausente: 'Destinatário ausente',
  divergencia_quantidade: 'Divergência de quantidade',
  item_avariado: 'Item avariado',
  item_faltante: 'Item faltante',
  recusa_parcial: 'Recusa parcial',
  recusa_total: 'Recusa total',
}

/** Deriva do catálogo legado — a lista não é reescrita à mão. */
export const OCCURRENCE_TYPE_CATALOG: readonly OccurrenceTypeCatalogEntry[] =
  TRIP_OCCURRENCE_TYPES.map((entry) => {
    const name = OCCURRENCE_TYPE_LABEL[entry.type]
    if (name === undefined) {
      throw new Error(`Occurrence type catalog lacks a pt-BR label for ${entry.type}`)
    }

    return { name, stage: entry.stage }
  })
