/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O critério da D4, já com o documento do emitente resolvido **em memória** a partir da chave opaca
 * do `context`. Ele nunca é persistido: a sessão guarda a chave, o pedido guarda os ids das notas.
 */
export type DocumentSelectionCriterion =
  | Readonly<{
      emitterTaxId: string
      firstNumber: number
      kind: 'number_range'
      lastNumber: number
      series: string
    }>
  | Readonly<{ kind: 'trip'; tripId: string }>
  | Readonly<{ emitterTaxId: string; endDate: string; kind: 'issue_date'; startDate: string }>
  | Readonly<{ emitterTaxId: string; kind: 'sender' }>

export type SelectableEmitter = Readonly<{ name: string; taxId: string }>

export type SelectableTrip = Readonly<{
  createdAt: Date
  documentCount: number
  id: string
  vehiclePlate: string
}>

/** Acima do teto, `documentIds` volta vazio e `total` diz quantas o critério achou. */
export type DocumentSelectionResult = Readonly<{ documentIds: readonly string[]; total: number }>

export type DocumentSelectionRepositoryPort = Readonly<{
  findNfseProfileVersions(input: {
    readonly companyId: string
    readonly profileIds: readonly string[]
  }): Promise<ReadonlyMap<string, string>>
  listIssueDateEmitters(input: {
    readonly companyId: string
    readonly endDate: string
    readonly startDate: string
  }): Promise<readonly SelectableEmitter[]>
  /** Só emitentes com nota autorizada ainda sem lote de CT-e nem NFS-e ativos. */
  listPendingEmitters(input: { readonly companyId: string }): Promise<readonly SelectableEmitter[]>
  listPendingSeries(input: {
    readonly companyId: string
    readonly emitterTaxId: string
  }): Promise<readonly string[]>
  listRecentTrips(input: {
    readonly companyId: string
    readonly since: Date
  }): Promise<readonly SelectableTrip[]>
  resolveSelection(input: {
    readonly companyId: string
    readonly criterion: DocumentSelectionCriterion
    readonly limit: number
  }): Promise<DocumentSelectionResult>
}>
