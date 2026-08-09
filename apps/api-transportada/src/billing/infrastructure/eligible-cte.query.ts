/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, gte, ilike, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm'

import {
  billingInvoiceItems,
  cteBatchItems,
  cteFiscalDocuments,
  freightCalculations,
  nfeDocuments,
  nfeParticipants,
} from '../../database/database.schema.js'

import { buildNumberFilter } from './number-filter.query.js'

export type EligibleCteFilterInput = {
  readonly batchId: string | null
  readonly batchIdIn: readonly string[] | null
  readonly companyId: string
  readonly cteDocumentIds: readonly string[] | null
  readonly cteNumber: string | null
  readonly cteNumberFrom: string | null
  readonly cteNumberIn: readonly string[] | null
  readonly cteNumberTo: string | null
  readonly customerDocument: string | null
  readonly customerName: string | null
  readonly from: string | null
  readonly maxAmount: string | null
  readonly minAmount: string | null
  readonly nfeNumberFrom: string | null
  readonly nfeNumberIn: readonly string[] | null
  readonly nfeNumberTo: string | null
  readonly to: string | null
}

const AUTHORIZED_DOCUMENT_STATUS = 'authorized'
const FISCAL_NUMBER_WIDTH = 9

/** O fim do período é uma data; sem o fecho do dia o último dia escolhido some da listagem. */
function endOfDay(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`)
}

/**
 * `nfe_documents.number` é texto sem preenchimento e sem índice: `::bigint` estouraria em qualquer
 * linha fora do padrão numérico, então os dois lados da comparação são preenchidos a 9 dígitos.
 */
const paddedNfeNumber = sql`lpad(${nfeDocuments.number}, 9, '0')`

function toPaddedFiscalNumber(value: string): string {
  return value.padStart(FISCAL_NUMBER_WIDTH, '0')
}

/**
 * Cliente da fatura é quem paga o frete, e o tomador do CT-e desta operação é o remetente da nota
 * (`toma3/toma = 0`): um embarcador que entrega em muitos pontos é um cliente só. O papel gravado
 * na importação para esse participante é `emitter` — `sender` é vocabulário dos matchers de perfil.
 */
export const BILLING_CUSTOMER_PARTICIPANT_ROLE = 'emitter'

/** Mesmo recorte de empresa do join da nota — o papel sozinho cruzaria tenants. */
export function buildBillingCustomerJoin(): SQL {
  const condition = and(
    eq(nfeParticipants.companyId, cteBatchItems.companyId),
    eq(nfeParticipants.documentId, cteBatchItems.nfeDocumentId),
    eq(nfeParticipants.role, BILLING_CUSTOMER_PARTICIPANT_ROLE),
  )
  if (condition === undefined) throw new Error('billing customer join condition is empty')
  return condition
}

/** A nota entra por `company_id` além do id: sem isso o join atravessaria empresas. */
export function buildEligibleNfeDocumentJoin(): SQL {
  const condition = and(
    eq(nfeDocuments.companyId, cteBatchItems.companyId),
    eq(nfeDocuments.id, cteBatchItems.nfeDocumentId),
  )
  if (condition === undefined) throw new Error('eligible nfe join condition is empty')
  return condition
}

/**
 * Recorte de elegibilidade e filtros da listagem num só lugar, para o isolamento de tenant ser
 * verificável sem banco — o mesmo seam usado pela exportação de CT-e.
 */
export function buildEligibleCteFilters(input: EligibleCteFilterInput): SQL[] {
  const conditions: (SQL | undefined)[] = [
    eq(cteFiscalDocuments.companyId, input.companyId),
    eq(cteFiscalDocuments.status, AUTHORIZED_DOCUMENT_STATUS),
    isNotNull(cteFiscalDocuments.authorizedAt),
    isNotNull(nfeParticipants.taxId),
    isNotNull(nfeParticipants.legalName),
    isNull(billingInvoiceItems.id),
    input.batchId === null ? undefined : eq(cteBatchItems.batchId, input.batchId),
    input.batchIdIn === null ? undefined : inArray(cteBatchItems.batchId, input.batchIdIn),
    input.cteDocumentIds === null
      ? undefined
      : inArray(cteFiscalDocuments.id, input.cteDocumentIds),
    input.cteNumber === null
      ? undefined
      : eq(cteFiscalDocuments.fiscalNumber, BigInt(input.cteNumber)),
    buildNumberFilter({
      column: cteFiscalDocuments.fiscalNumber,
      from: input.cteNumberFrom,
      list: input.cteNumberIn,
      to: input.cteNumberTo,
      toComparable: BigInt,
    }),
    buildNumberFilter({
      column: paddedNfeNumber,
      from: input.nfeNumberFrom,
      list: input.nfeNumberIn,
      to: input.nfeNumberTo,
      toComparable: toPaddedFiscalNumber,
    }),
    input.customerDocument === null ? undefined : eq(nfeParticipants.taxId, input.customerDocument),
    input.customerName === null
      ? undefined
      : ilike(nfeParticipants.legalName, `%${input.customerName}%`),
    input.from === null ? undefined : gte(cteFiscalDocuments.authorizedAt, new Date(input.from)),
    input.to === null ? undefined : lte(cteFiscalDocuments.authorizedAt, endOfDay(input.to)),
    input.minAmount === null ? undefined : gte(freightCalculations.totalAmount, input.minAmount),
    input.maxAmount === null ? undefined : lte(freightCalculations.totalAmount, input.maxAmount),
  ]

  return conditions.filter((condition): condition is SQL => condition !== undefined)
}
