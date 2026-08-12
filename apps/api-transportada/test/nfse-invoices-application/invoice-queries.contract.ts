/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceQueryUseCase } from '../../src/nfse-invoices/application/nfse-invoice-query.use-case'
import type { NfseFiscalDocumentArchivePort } from '../../src/nfse-invoices/application/nfse-invoice.port'
import {
  NfseFiscalDocumentUnavailableError,
  NfseInvoiceNotFoundError,
} from '../../src/nfse-invoices/domain/nfse-issuance.error'
import {
  COMPANY_ID,
  CONTEXT,
  DOCUMENT_ID,
  FISCAL_DOCUMENT_LOCATION,
  INVOICE_DETAIL,
  INVOICE_ID,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const DOWNLOAD_URL = 'https://storage.local/signed/nfse.xml?signature=redacted'
const EXPIRES_AT = '2026-08-12T12:05:00.000Z'

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture(overrides)
  const signed: { bucket: string; fileName: string; key: string }[] = []
  const archive: NfseFiscalDocumentArchivePort = {
    async createDownloadUrl(input) {
      signed.push({ bucket: input.bucket, fileName: input.fileName, key: input.key })
      return { expiresAt: EXPIRES_AT, url: DOWNLOAD_URL }
    },
  }

  return {
    ...fixture,
    signed,
    useCase: createNfseInvoiceQueryUseCase({ archive, repository: fixture.repository }),
  }
}

describe('nfse invoice listing', () => {
  /** Listar é leitura: abrir transação aqui prenderia conexão do pool para nada. */
  test('a listagem não abre transação', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.list({ context: CONTEXT, cursor: null, limit: 25 })

    expect(recording.transactionScopes).toEqual([])
  })

  test('a listagem leva a empresa do contexto, o cursor e os filtros para o repositório', async () => {
    const { recording, useCase } = createUseCase()
    const cursor = { createdAt: '2026-08-01T12:00:00.000Z', id: INVOICE_ID }

    await useCase.list({
      context: CONTEXT,
      cursor,
      filters: { statusIn: ['authorized'] },
      limit: 10,
    })

    expect(recording.queries).toEqual([
      {
        input: {
          companyId: COMPANY_ID,
          cursor,
          filters: { statusIn: ['authorized'] },
          limit: 10,
        },
        name: 'listInvoices',
      },
    ])
  })
})

describe('nfse invoice detail', () => {
  test('o detalhe devolve a nota com os encargos', async () => {
    const { useCase } = createUseCase()

    const invoice = await useCase.detail({ context: CONTEXT, invoiceId: INVOICE_ID })

    expect(invoice.id).toBe(INVOICE_ID)
    expect(invoice.charges).toHaveLength(1)
    expect(invoice.documentCount).toBe(1)
  })

  /** Nota de outra empresa some do recorte do repositório: 404, nunca 403 — 403 já diria que existe. */
  test('nota fora do recorte da empresa é 404', async () => {
    const { useCase } = createUseCase({ invoiceDetail: null })

    await expect(
      useCase.detail({ context: CONTEXT, invoiceId: INVOICE_ID }),
    ).rejects.toBeInstanceOf(NfseInvoiceNotFoundError)
  })

  test('os vínculos devolvem as NF-e que compõem a nota', async () => {
    const { useCase } = createUseCase()

    const documents = await useCase.documents({ context: CONTEXT, invoiceId: INVOICE_ID })

    expect(documents).toHaveLength(1)
    expect(documents[0]?.documentId).toBe(DOCUMENT_ID)
  })

  /** Sem o detalhe antes, a nota de outra empresa devolveria lista vazia em vez de 404. */
  test('os vínculos de nota fora do recorte da empresa são 404, não lista vazia', async () => {
    const { recording, useCase } = createUseCase({ invoiceDetail: null })

    await expect(
      useCase.documents({ context: CONTEXT, invoiceId: INVOICE_ID }),
    ).rejects.toBeInstanceOf(NfseInvoiceNotFoundError)
    expect(recording.queries.map((query) => query.name)).toEqual(['findInvoiceDetail'])
  })
})

describe('nfse fiscal document download', () => {
  /**
   * O XML fiscal nunca passa pelo corpo da resposta: a rota devolve link assinado de vida curta, e
   * é o storage que entrega os bytes.
   */
  test('o download devolve URL assinada, não o conteúdo do documento', async () => {
    const { signed, useCase } = createUseCase()

    const download = await useCase.download({
      context: CONTEXT,
      invoiceId: INVOICE_ID,
      kind: 'xml',
    })

    expect(download).toEqual({ expiresAt: EXPIRES_AT, url: DOWNLOAD_URL })
    expect(signed).toEqual([
      {
        bucket: FISCAL_DOCUMENT_LOCATION.bucket,
        fileName: `nfse-${INVOICE_DETAIL.providerNumber}.xml`,
        key: FISCAL_DOCUMENT_LOCATION.key,
      },
    ])
  })

  test('o nome do arquivo do PDF sai do número da prefeitura', async () => {
    const { signed, useCase } = createUseCase()

    await useCase.download({ context: CONTEXT, invoiceId: INVOICE_ID, kind: 'pdf' })

    expect(signed[0]?.fileName).toBe(`nfse-${INVOICE_DETAIL.providerNumber}.pdf`)
  })

  /** O XML e o PDF chegam com a autorização: antes disso não há objeto para assinar. */
  test('documento ainda não arquivado é conflito, não 404', async () => {
    const { signed, useCase } = createUseCase({ fiscalDocumentLocation: null })

    await expect(
      useCase.download({ context: CONTEXT, invoiceId: INVOICE_ID, kind: 'pdf' }),
    ).rejects.toBeInstanceOf(NfseFiscalDocumentUnavailableError)
    expect(signed).toEqual([])
  })

  test('nota fora do recorte da empresa não chega a pedir assinatura', async () => {
    const { signed, useCase } = createUseCase({ invoiceDetail: null })

    await expect(
      useCase.download({ context: CONTEXT, invoiceId: INVOICE_ID, kind: 'xml' }),
    ).rejects.toBeInstanceOf(NfseInvoiceNotFoundError)
    expect(signed).toEqual([])
  })

  test('a busca do objeto carrega a empresa do contexto', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.download({ context: CONTEXT, invoiceId: INVOICE_ID, kind: 'xml' })

    expect(recording.queries).toContainEqual({
      input: { companyId: COMPANY_ID, invoiceId: INVOICE_ID, kind: 'xml' },
      name: 'findFiscalDocumentLocation',
    })
  })
})
