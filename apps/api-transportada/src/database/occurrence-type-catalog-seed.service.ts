/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_TYPE_CATALOG,
  type OccurrenceTypeCatalogEntry,
} from '../shared/occurrence-type-catalog.constant.js'

export type OccurrenceTypeCatalogSeedPort = {
  listCompanyIds(): Promise<readonly string[]>
  /** Qualquer linha, ativa ou não — é só a presença que decide se a empresa já tem catálogo. */
  hasAnyOccurrenceType(input: { readonly companyId: string }): Promise<boolean>
  insertOccurrenceTypes(input: {
    readonly companyId: string
    readonly types: readonly OccurrenceTypeCatalogEntry[]
  }): Promise<void>
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
  const companyIds = await port.listCompanyIds()

  const createdPerCompany = await Promise.all(
    companyIds.map((companyId) => bootstrapCompanyOccurrenceTypes({ companyId, port })),
  )

  return createdPerCompany.reduce((total, count) => total + count, 0)
}

async function bootstrapCompanyOccurrenceTypes({
  companyId,
  port,
}: {
  readonly companyId: string
  readonly port: OccurrenceTypeCatalogSeedPort
}): Promise<number> {
  const hasAny = await port.hasAnyOccurrenceType({ companyId })
  if (hasAny) return 0

  await port.insertOccurrenceTypes({ companyId, types: OCCURRENCE_TYPE_CATALOG })
  return OCCURRENCE_TYPE_CATALOG.length
}
