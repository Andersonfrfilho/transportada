/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_TYPE_CATALOG,
  RECEIVING_OCCURRENCE_TYPE_CATALOG,
  type OccurrenceTypeCatalogEntry,
} from '../shared/occurrence-type-catalog.constant.js'
import {
  TRIP_BOUND_OCCURRENCE_STAGES,
  TRIP_OCCURRENCE_STAGE,
  type TripOccurrenceStage,
} from '../shared/trip-occurrence.constant.js'

export type OccurrenceTypeCatalogSeedPort = {
  listCompanyIds(): Promise<readonly string[]>
  /**
   * Qualquer linha das etapas pedidas, ativa ou não — é só a presença que decide se a empresa já
   * tem aquele catálogo (spec 237: o de viagem e o de recebimento são bootstraps separados).
   */
  hasAnyOccurrenceType(input: {
    readonly companyId: string
    readonly stages: readonly TripOccurrenceStage[]
  }): Promise<boolean>
  /**
   * Devolve quantos nasceram: nome já usado na empresa (em qualquer etapa — o unique de nome não olha
   * a etapa) é pulado, nunca derruba o pre-deploy.
   */
  insertOccurrenceTypes(input: {
    readonly companyId: string
    readonly types: readonly OccurrenceTypeCatalogEntry[]
  }): Promise<number>
}

/**
 * ⚠️ **Bootstrap, não sincronização.** A primeira versão comparava por `(stage, name)` para
 * "preencher o que falta" a cada deploy — e isso ressuscitava tipo renomeado: renomear é operação
 * suportada pela tela de cadastro, e o próximo deploy não reconhecia o nome novo, inseria o antigo
 * de novo, e o operador via dois tipos até alguém aposentar o duplicado. Cada deploy repetia o
 * ruído.
 *
 * A regra agora é: **empresa com qualquer tipo cadastrado (ativo ou não) é intocável.** Só a
 * empresa com catálogo **vazio** recebe os sete tipos, uma vez. Isso resolve o defeito real (catálogo
 * vazio em staging e produção) sem nunca competir com quem já cadastrou — renomear, aposentar ou
 * apagar seis dos sete tipos são decisões definitivas da transportadora, preservadas para sempre.
 */
export async function seedOccurrenceTypeCatalog({
  port,
}: {
  readonly port: OccurrenceTypeCatalogSeedPort
}): Promise<number> {
  return seedCatalog({
    port,
    stages: TRIP_BOUND_OCCURRENCE_STAGES,
    types: OCCURRENCE_TYPE_CATALOG,
  })
}

/** Spec 237 T3.2 (ADR-0094 §9.2): a mesma regra de bootstrap, só para a etapa `receiving`. */
export async function seedReceivingOccurrenceTypeCatalog({
  port,
}: {
  readonly port: OccurrenceTypeCatalogSeedPort
}): Promise<number> {
  return seedCatalog({
    port,
    stages: [TRIP_OCCURRENCE_STAGE.receiving],
    types: RECEIVING_OCCURRENCE_TYPE_CATALOG,
  })
}

type SeedCatalogParams = {
  readonly port: OccurrenceTypeCatalogSeedPort
  readonly stages: readonly TripOccurrenceStage[]
  readonly types: readonly OccurrenceTypeCatalogEntry[]
}

async function seedCatalog(params: SeedCatalogParams): Promise<number> {
  const companyIds = await params.port.listCompanyIds()

  const createdPerCompany = await Promise.all(
    companyIds.map((companyId) => bootstrapCompanyOccurrenceTypes({ ...params, companyId })),
  )

  return createdPerCompany.reduce((total, count) => total + count, 0)
}

async function bootstrapCompanyOccurrenceTypes({
  companyId,
  port,
  stages,
  types,
}: SeedCatalogParams & { readonly companyId: string }): Promise<number> {
  const hasAny = await port.hasAnyOccurrenceType({ companyId, stages })
  if (hasAny) return 0

  return port.insertOccurrenceTypes({ companyId, types })
}
