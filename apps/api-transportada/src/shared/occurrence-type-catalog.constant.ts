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
import {
  TRIP_OCCURRENCE_STAGE,
  TRIP_OCCURRENCE_TYPES,
  type TripOccurrenceStage,
} from './trip-occurrence.constant.js'

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

const DERIVED_OCCURRENCE_TYPE_CATALOG: readonly OccurrenceTypeCatalogEntry[] =
  TRIP_OCCURRENCE_TYPES.map((entry) => {
    const name = OCCURRENCE_TYPE_LABEL[entry.type]
    if (name === undefined) {
      throw new Error(`Occurrence type catalog lacks a pt-BR label for ${entry.type}`)
    }

    return { name, stage: entry.stage }
  })

/**
 * Pedido do usuário (spec 208, 25/09/2026): tipo de rua para o motorista registrar que o cliente
 * pediu a segunda via do boleto — sem exigir foto, sem soltar a nota da viagem.
 *
 * ⚠️ **Entrada literal, não derivada de `TRIP_OCCURRENCE_TYPES`.** Aquela lista é o `type` de
 * `trip_document_occurrences`, com CHECK fixo no banco, cópia por valor no `frontend-transportada`
 * (contrato de paridade em `test/trip-occurrence/catalog.contract.ts`) e `stage` que decide
 * permissão via `resolveOccurrenceStage`. `company_occurrence_types` (o que este catálogo semeia)
 * não tem esse acoplamento — `name` é texto livre e `attachmentMode`/`leavesDocumentBehind` saem
 * dos defaults de coluna (`'off'`/`false`) quando o seed não os escreve. Acrescentar aqui não pede
 * migration nem mexe em permissão; acrescentar em `TRIP_OCCURRENCE_TYPES` pediria os dois.
 */
export const OCCURRENCE_TYPE_CATALOG: readonly OccurrenceTypeCatalogEntry[] = [
  ...DERIVED_OCCURRENCE_TYPE_CATALOG,
  { name: 'Cliente pediu segunda via do boleto', stage: TRIP_OCCURRENCE_STAGE.delivery },
]
