/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { type SQL, and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceOutbox,
  nfseServiceInvoiceCharges,
  nfseServiceInvoiceDocuments,
  nfseServiceInvoices,
} from '../../database/nfse.schema.js'
import type { NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'
import { storedObjects } from '../../database/storage.schema.js'

export type NfseInvoiceScope = {
  readonly companyId: string
  readonly invoiceId: string
}

export type NfseInvoiceListFilters = {
  readonly createdFrom?: string | undefined
  readonly createdUntil?: string | undefined
  readonly statusIn?: readonly NfseServiceInvoiceStatus[] | undefined
  readonly takerTaxIdEq?: string | undefined
}

export type NfseInvoiceCursor = {
  readonly createdAt: string
  readonly id: string
}

export function buildInvoiceListFilters(input: {
  readonly companyId: string
  readonly cursor?: NfseInvoiceCursor | null
  readonly filters?: NfseInvoiceListFilters | undefined
}): readonly SQL[] {
  const filters = input.filters ?? {}
  const conditions: SQL[] = [eq(nfseServiceInvoices.companyId, input.companyId)]

  if (filters.statusIn !== undefined && filters.statusIn.length > 0) {
    conditions.push(inArray(nfseServiceInvoices.status, [...filters.statusIn]))
  }
  if (filters.takerTaxIdEq !== undefined) {
    conditions.push(eq(nfseServiceInvoices.takerTaxId, filters.takerTaxIdEq))
  }
  if (filters.createdFrom !== undefined) {
    conditions.push(gte(nfseServiceInvoices.createdAt, new Date(filters.createdFrom)))
  }
  if (filters.createdUntil !== undefined) {
    conditions.push(lte(nfseServiceInvoices.createdAt, new Date(filters.createdUntil)))
  }
  if (input.cursor !== undefined && input.cursor !== null) {
    conditions.push(buildInvoiceCursorFilter(input.cursor))
  }

  return conditions
}

/**
 * Keyset por `(created_at, id)`. Com `offset`, uma emissão nova entre duas páginas empurraria a
 * lista e a tela repetiria ou pularia nota.
 */
export function buildInvoiceCursorFilter(cursor: NfseInvoiceCursor): SQL {
  return sql`(${nfseServiceInvoices.createdAt}, ${nfseServiceInvoices.id}) < (${new Date(cursor.createdAt)}, ${cursor.id})`
}

export function buildInvoiceScopeFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoices.companyId, scope.companyId),
    eq(nfseServiceInvoices.id, scope.invoiceId),
  ]
}

export function buildInvoiceChargeFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceCharges.companyId, scope.companyId),
    eq(nfseServiceInvoiceCharges.invoiceId, scope.invoiceId),
  ]
}

/** O detalhe mostra também o vínculo cancelado: é o histórico de quem esteve na nota. */
export function buildInvoiceDocumentFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, scope.companyId),
    eq(nfseServiceInvoiceDocuments.invoiceId, scope.invoiceId),
  ]
}

/** Sem `company_id` no join, o vínculo alcançaria a nota fiscal de outra empresa pelo id sozinho. */
export function buildInvoiceDocumentJoin(): SQL {
  const condition = and(
    eq(nfeDocuments.companyId, nfseServiceInvoiceDocuments.companyId),
    eq(nfeDocuments.id, nfseServiceInvoiceDocuments.nfeDocumentId),
  )
  if (condition === undefined) throw new Error('nfse invoice document join condition is empty')
  return condition
}

/**
 * O vínculo cancelado continua contando: a nota foi emitida sobre aquelas notas, e o número na
 * listagem é a composição dela, não o que ainda está reservado.
 *
 * A correlação passa por `and(eq(...))` de propósito. Interpolar as colunas soltas no template
 * (`${a.companyId} = ${b.companyId}`) as emite sem o nome da tabela, e o Postgres resolve os dois
 * lados na tabela interna: a comparação vira sempre verdadeira de um lado, nunca casa do outro, e a
 * contagem sai zero sem erro nenhum.
 */
export function buildInvoiceDocumentCountExpression(): SQL<bigint> {
  const correlation = and(
    eq(nfseServiceInvoiceDocuments.companyId, nfseServiceInvoices.companyId),
    eq(nfseServiceInvoiceDocuments.invoiceId, nfseServiceInvoices.id),
  )
  if (correlation === undefined) throw new Error('nfse invoice document count correlation is empty')
  return sql<bigint>`(select count(*) from ${nfseServiceInvoiceDocuments} where ${correlation})`
}

/**
 * Mesmo recorte do índice parcial único da tabela. Cancelar duas vezes não pode reescrever a data:
 * a primeira liberação é a que devolveu as notas para a seleção.
 */
export function buildInvoiceLinkReleaseFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, scope.companyId),
    eq(nfseServiceInvoiceDocuments.invoiceId, scope.invoiceId),
    isNull(nfseServiceInvoiceDocuments.cancelledAt),
  ]
}

/** A tentativa mais recente é a que a tela lê: as anteriores já foram substituídas por esta. */
export function buildLatestAttemptFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseIssuanceAttempts.companyId, scope.companyId),
    eq(nfseIssuanceAttempts.invoiceId, scope.invoiceId),
  ]
}

/**
 * Só a linha ainda não publicada carrega quando a próxima entrega acontece — publicada, a data é
 * a da entrega que já saiu, e mostrá-la seria prometer uma tentativa que não vem.
 */
export function buildPendingOutboxFilters(input: {
  readonly attemptId: string
  readonly companyId: string
}): readonly SQL[] {
  return [
    eq(nfseIssuanceOutbox.companyId, input.companyId),
    eq(nfseIssuanceOutbox.attemptId, input.attemptId),
    isNull(nfseIssuanceOutbox.publishedAt),
  ]
}

export function buildFiscalDocumentFilters(scope: NfseInvoiceScope): readonly SQL[] {
  return [
    eq(nfseFiscalDocuments.companyId, scope.companyId),
    eq(nfseFiscalDocuments.invoiceId, scope.invoiceId),
  ]
}

/** O objeto guarda XML fiscal: com o id sozinho, a rota assinaria o download de outra empresa. */
export function buildStoredObjectFilters(input: {
  readonly companyId: string
  readonly objectId: string
}): readonly SQL[] {
  return [eq(storedObjects.companyId, input.companyId), eq(storedObjects.id, input.objectId)]
}
