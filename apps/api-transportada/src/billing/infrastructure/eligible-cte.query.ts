/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, gte, ilike, inArray, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm'

import {
  billingInvoiceItems,
  cteBatchItems,
  cteFiscalDocuments,
  cteIssuancePayloads,
  freightCalculations,
  nfeDocuments,
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
 * Cliente da fatura é o tomador do frete, e quem é o tomador está configurado por perfil de emissão
 * (`cte_emission_profiles.taker`): remetente em `0`, destinatário em `3`. A emissão grava o valor
 * resolvido, então o faturamento lê o tomador daquele CT-e mesmo que o perfil mude depois.
 */
export function buildBillingTakerJoin(): SQL {
  const condition = and(
    eq(cteIssuancePayloads.companyId, cteFiscalDocuments.companyId),
    eq(cteIssuancePayloads.attemptId, cteFiscalDocuments.attemptId),
  )
  if (condition === undefined) throw new Error('billing taker join condition is empty')
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
    isNotNull(cteIssuancePayloads.takerTaxId),
    isNotNull(cteIssuancePayloads.takerLegalName),
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
    input.customerDocument === null
      ? undefined
      : eq(cteIssuancePayloads.takerTaxId, input.customerDocument),
    input.customerName === null
      ? undefined
      : ilike(cteIssuancePayloads.takerLegalName, `%${input.customerName}%`),
    input.from === null ? undefined : gte(cteFiscalDocuments.authorizedAt, new Date(input.from)),
    input.to === null ? undefined : lte(cteFiscalDocuments.authorizedAt, endOfDay(input.to)),
    input.minAmount === null ? undefined : gte(freightCalculations.totalAmount, input.minAmount),
    input.maxAmount === null ? undefined : lte(freightCalculations.totalAmount, input.maxAmount),
  ]

  return conditions.filter((condition): condition is SQL => condition !== undefined)
}
