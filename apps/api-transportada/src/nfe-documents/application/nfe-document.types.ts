/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

export type NfeDocumentSummary = {
  readonly accessKey: string
  readonly cteBlockReason: string | null
  /** Bloqueio da NFS-e, que não conhece peso. Nulo aqui e preenchido acima é o caso da spec 067. */
  readonly nfseBlockReason: string | null
  readonly emitterAddress: string | null
  readonly emitterCity: string | null
  readonly emitterCityCode: string | null
  readonly emitterName: string
  readonly emitterState: string | null
  readonly emitterTaxId: string | null
  readonly id: string
  readonly issuedAt: string
  readonly nfseInvoiceId: string | null
  readonly nfseInvoiceNumber: string | null
  readonly number: string
  readonly recipientAddress: string | null
  /**
   * O CEP do destinatário. Ele já estava em `nfe_addresses` e não saía na listagem — quem monta a
   * viagem lê o endereço para conferir a parada, e sem o CEP duas ruas homônimas em bairros
   * diferentes são a mesma linha na tela.
   */
  readonly recipientPostalCode: string | null
  readonly recipientAddressNumber: string | null
  /**
   * Onde a carga para, quando a cascata já resolveu o endereço (ADR-0044 §3). A precisão vem junto
   * e é obrigatória em qualquer tela que use a coordenada: `city` é centroide de município, palpite
   * de quilômetros, e a ADR-0044 §5 manda marcá-la em vez de deixá-la passar por endereço.
   */
  readonly recipientLatitude: string | null
  readonly recipientLongitude: string | null
  readonly recipientLocationPrecision: string | null
  readonly recipientCity: string | null
  readonly recipientCityCode: string | null
  readonly recipientName: string
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly series: string
  readonly status: 'authorized' | 'cancelled' | 'denied' | 'unsigned'
  readonly totalAmount: string
  /**
   * Spec 065 D4b: a viagem em que a nota saiu. **Sinal, não bloqueio** — nota que rodou é
   * justamente a que deve entrar no lote, e nenhum bloqueio lê estes dois campos.
   */
  readonly tripId: string | null
  readonly tripStatus: string | null
  readonly variant: 'complete' | 'summary' | 'event'
}

export type NfeDocumentDetail = NfeDocumentSummary

export type NfeDocumentPage = {
  readonly items: readonly NfeDocumentSummary[]
  readonly nextCursor: string | null
}

export type DownloadNfeDocumentXmlResult = {
  readonly accessKey: string
  readonly content: Uint8Array | ReadableStream<Uint8Array>
  readonly contentType: string
  readonly fileName: string
}

export type NfeDocumentEligibility = {
  readonly authorizedDocument: boolean
  readonly companyRelated: boolean
  readonly decision: 'PENDING_FREIGHT_AND_CTE_RULES'
  readonly hasOriginalXml: boolean
}

export type NfeDocumentRepositoryPort = {
  downloadXml(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<DownloadNfeDocumentXmlResult>
  get(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentDetail>
  getEligibility(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentEligibility>
  list(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeDocumentPage>
}
