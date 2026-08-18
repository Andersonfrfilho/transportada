/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { extractLastIssuancePayload } from '../domain/nfse-issuance-payload.mapper.js'
import {
  NfseFiscalDocumentUnavailableError,
  NfseInvoiceNotFoundError,
} from '../domain/nfse-issuance.error.js'
import type {
  NfseFiscalDocumentArchivePort,
  NfseFiscalDocumentDownload,
  NfseFiscalDocumentKind,
  NfseInvoiceCompanyContext,
  NfseInvoiceCursor,
  NfseInvoiceDetail,
  NfseInvoiceLinkedDocument,
  NfseInvoiceListFilters,
  NfseInvoicePage,
  NfseInvoiceRepositoryPort,
  NfseLastIssuancePayload,
} from './nfse-invoice.port.js'

const FILE_EXTENSION: Readonly<Record<NfseFiscalDocumentKind, string>> = {
  pdf: 'pdf',
  xml: 'xml',
}

export type ListNfseInvoicesInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly cursor: NfseInvoiceCursor | null
  readonly filters?: NfseInvoiceListFilters | undefined
  readonly limit: number
}

export type NfseInvoiceScopedInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly invoiceId: string
}

export type DownloadNfseFiscalDocumentInput = NfseInvoiceScopedInput & {
  readonly kind: NfseFiscalDocumentKind
}

export type NfseInvoiceDetailWithPayload = NfseInvoiceDetail & {
  readonly lastPayload: NfseLastIssuancePayload | null
}

export type NfseInvoiceQueryUseCase = {
  detail(input: NfseInvoiceScopedInput): Promise<NfseInvoiceDetailWithPayload>
  documents(input: NfseInvoiceScopedInput): Promise<readonly NfseInvoiceLinkedDocument[]>
  download(input: DownloadNfseFiscalDocumentInput): Promise<NfseFiscalDocumentDownload>
  list(input: ListNfseInvoicesInput): Promise<NfseInvoicePage>
}

export function createNfseInvoiceQueryUseCase(dependencies: {
  readonly archive: NfseFiscalDocumentArchivePort
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceQueryUseCase {
  const { archive, repository } = dependencies

  return {
    /**
     * `lastPayload` só é buscado aqui, não em `loadDetail`: `documents()`/`download()` reusam
     * `loadDetail` e não precisam do payload congelado, só do 404 correto.
     */
    async detail(input) {
      const invoice = await loadDetail(repository, input)
      const frozenPayload = await repository.findLatestPayload({
        companyId: input.context.companyId,
        invoiceId: input.invoiceId,
      })

      return {
        ...invoice,
        lastPayload: frozenPayload === null ? null : extractLastIssuancePayload(frozenPayload),
      }
    },

    /** O detalhe roda antes: sem ele, uma nota de outra empresa devolveria lista vazia em vez de 404. */
    async documents(input) {
      await loadDetail(repository, input)
      return repository.findInvoiceDocuments({
        companyId: input.context.companyId,
        invoiceId: input.invoiceId,
      })
    },

    async download(input) {
      const invoice = await loadDetail(repository, input)
      const location = await repository.findFiscalDocumentLocation({
        companyId: input.context.companyId,
        invoiceId: input.invoiceId,
        kind: input.kind,
      })
      if (location === null) throw new NfseFiscalDocumentUnavailableError()

      return archive.createDownloadUrl({
        bucket: location.bucket,
        fileName: buildFileName({ invoice, kind: input.kind }),
        key: location.key,
      })
    },

    async list(input) {
      return repository.listInvoices({
        companyId: input.context.companyId,
        cursor: input.cursor,
        filters: input.filters,
        limit: input.limit,
      })
    },
  }
}

async function loadDetail(
  repository: NfseInvoiceRepositoryPort,
  input: NfseInvoiceScopedInput,
): Promise<NfseInvoiceDetail> {
  const invoice = await repository.findInvoiceDetail({
    companyId: input.context.companyId,
    invoiceId: input.invoiceId,
  })
  if (invoice === null) throw new NfseInvoiceNotFoundError()
  return invoice
}

/** O nome do arquivo sai do número da prefeitura quando ele já existe; senão, do id da nota. */
function buildFileName(input: {
  readonly invoice: NfseInvoiceDetail
  readonly kind: NfseFiscalDocumentKind
}): string {
  const identifier = input.invoice.providerNumber ?? input.invoice.id
  return `nfse-${identifier}.${FILE_EXTENSION[input.kind]}`
}
