/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T019: o que vai dentro da nota, para quem confere a carga com a caixa na mão.
 */

export type TripDocumentProduct = {
  readonly code: string
  readonly commercialUnit: string
  readonly description: string
  readonly ordinal: number
  readonly quantity: string
  readonly totalValue: string
  readonly unitValue: string
}

export type ReadTripDocumentProductsPort = {
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly TripDocumentProduct[]>
}

export type ReadTripDocumentProductsInput = {
  readonly companyId: string
  readonly documentId: string
  readonly repository: ReadTripDocumentProductsPort
  readonly tripId: string
}

/**
 * ⚠️ **NCM e CFOP não saem daqui**, embora `nfe_products` os guarde. Eles são classificação fiscal;
 * quem confere a carga precisa de código, descrição e quantidade, e o resto é ruído numa lista lida
 * de pé no galpão. Publicá-los "porque a tabela tem" é o caminho por onde uma tela de conferência
 * vira relatório fiscal sem ninguém decidir isso.
 *
 * Nota sem item é lista vazia — o vínculo que é só cálculo de frete não tem produto nenhum.
 */
export async function readTripDocumentProducts({
  companyId,
  documentId,
  repository,
  tripId,
}: ReadTripDocumentProductsInput): Promise<readonly TripDocumentProduct[]> {
  return repository.listDocumentProducts({ companyId, documentId, tripId })
}
