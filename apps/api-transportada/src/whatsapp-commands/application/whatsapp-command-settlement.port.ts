/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Um CT-e do pedido, por nota. `status` é o do documento fiscal quando ele existe (autorizado ou
 * cancelado) e, antes disso, o da última tentativa de emissão — `pending` quando nem tentativa há.
 */
export type SettlementCteDocument = Readonly<{
  cteDocumentId: string | undefined
  errorCause: string | undefined
  errorCode: string | undefined
  /** A chave da fatura ativa que já contém este CT-e; `undefined` quando ele está livre. */
  invoiceIdempotencyKey: string | undefined
  nfeDocumentId: string
  nfeNumber: string
  status: string
}>

export type SettlementNfseInvoice = Readonly<{
  id: string
  rejectionCode: string | undefined
  rejectionMessage: string | undefined
  status: string
  takerTaxId: string
}>

/** Tudo pelo `companyId` do pedido: o id do lote e o da NFS-e saem do diário daquela empresa. */
export type WhatsAppCommandSettlementReaderPort = Readonly<{
  readCteDocuments(input: {
    readonly batchIds: readonly string[]
    readonly companyId: string
  }): Promise<readonly SettlementCteDocument[]>
  readNfseInvoices(input: {
    readonly companyId: string
    readonly invoiceIds: readonly string[]
  }): Promise<readonly SettlementNfseInvoice[]>
}>
