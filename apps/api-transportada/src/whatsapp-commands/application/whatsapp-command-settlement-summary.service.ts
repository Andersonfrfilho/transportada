/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — o resumo que volta ao número de quem confirmou (D6.6): autorizados, rejeitados com
 * o motivo, pendentes das duas horas, faturas e a NFS-e "autorizada, sem fatura". O texto carrega
 * número de nota e motivo da SEFAZ, então **nunca** vai para log: quem o recebe é só o destinatário.
 */
import type { WhatsAppCommandSettlementCode } from '../../database/whatsapp-command.schema.js'
import {
  ISSUANCE_BLOCK_REASON_LABELS,
  ISSUANCE_UNKNOWN_REASON_LABEL,
} from '../domain/whatsapp-issuance-labels.constant.js'
import { classifyWhatsAppCommandDocument } from '../domain/whatsapp-command-settlement.policy.js'
import type {
  SettlementCteDocument,
  SettlementNfseInvoice,
} from './whatsapp-command-settlement.port.js'

/** O teto de linhas por lista: o resumo cabe no celular, e o resto está no painel. */
const LISTED_ITEMS_LIMIT = 10
const REQUEST_PREFIX_LENGTH = 8
const TAKER_SUFFIX_LENGTH = 4

export type SettlementFailedGroup = Readonly<{ label: string; reason: string }>
export type SettlementInvoice = Readonly<{ count: number; takerTaxId: string }>
export type SettlementBillingFailure = Readonly<{ code: string; takerTaxId: string | undefined }>

export type SettlementSummaryInput = Readonly<{
  billingFailures: readonly SettlementBillingFailure[]
  ctes: readonly SettlementCteDocument[]
  dueDate: string | undefined
  failedGroups: readonly SettlementFailedGroup[]
  invoices: readonly SettlementInvoice[]
  nfse: readonly SettlementNfseInvoice[]
  requestId: string
  settlementOutcome: WhatsAppCommandSettlementCode
}>

export function buildWhatsAppCommandSettlementSummary(input: SettlementSummaryInput): string {
  return [
    `Resultado do pedido ${input.requestId.slice(0, REQUEST_PREFIX_LENGTH)}:`,
    ...describeCtes(input.ctes),
    ...input.failedGroups.map(describeFailedGroup),
    ...describeNfse(input.nfse),
    ...describeBilling(input),
  ].join('\n')
}

function describeCtes(ctes: readonly SettlementCteDocument[]): string[] {
  const authorized = ctes.filter((cte) => outcomeOf(cte.status) === 'success').length
  const failed = ctes.filter((cte) => outcomeOf(cte.status) === 'failure')
  const pending = ctes.filter((cte) => outcomeOf(cte.status) === 'pending')
  const lines: string[] = []
  if (authorized > 0) {
    lines.push(`✅ ${authorized} CT-e ${authorized === 1 ? 'autorizado' : 'autorizados'}`)
  }
  lines.push(...limitList(failed.map(describeFailedCte)))
  if (pending.length > 0) {
    const numbers = limitNumbers(pending.map((cte) => cte.nfeNumber))
    lines.push(`⏳ Sem resposta depois de 2 horas: NF-e ${numbers}`)
  }
  return lines
}

function describeFailedCte(cte: SettlementCteDocument): string {
  if (cte.status === 'cancelled') return `❌ NF-e ${cte.nfeNumber}: CT-e cancelado`
  const code = cte.errorCode ?? 'sem código'
  return `❌ NF-e ${cte.nfeNumber}: ${code} — ${cte.errorCause ?? 'motivo não informado'}`
}

function describeFailedGroup(group: SettlementFailedGroup): string {
  const label = ISSUANCE_BLOCK_REASON_LABELS[group.reason]
  const explained = label === undefined ? '' : ` — ${label}`
  return `❌ ${group.label}: não saiu (${group.reason})${explained}`
}

function describeNfse(invoices: readonly SettlementNfseInvoice[]): string[] {
  const authorized = invoices.filter((invoice) => outcomeOf(invoice.status) === 'success').length
  const failed = invoices.filter((invoice) => outcomeOf(invoice.status) === 'failure')
  const pending = invoices.filter((invoice) => outcomeOf(invoice.status) === 'pending').length
  const lines: string[] = []
  if (authorized > 0) {
    const noun = authorized === 1 ? 'NFS-e autorizada' : 'NFS-e autorizadas'
    lines.push(`📄 ${authorized} ${noun}, sem fatura`)
  }
  lines.push(
    ...limitList(
      failed.map(
        (invoice) =>
          `❌ NFS-e do tomador final ${suffixOf(invoice.takerTaxId)}: ${invoice.rejectionCode ?? invoice.status} — ${invoice.rejectionMessage ?? ISSUANCE_UNKNOWN_REASON_LABEL}`,
      ),
    ),
  )
  if (pending > 0) lines.push(`⏳ NFS-e sem resposta depois de 2 horas: ${pending}`)
  return lines
}

function describeBilling(input: SettlementSummaryInput): string[] {
  if (input.settlementOutcome === 'actor_not_authorized') {
    return ['⚠️ Nenhuma fatura foi criada: seu acesso não permite mais faturar nesta empresa.']
  }
  const dueDate = input.dueDate === undefined ? '' : `, vencimento ${formatDay(input.dueDate)}`
  return [
    ...input.invoices.map(
      (invoice) =>
        `🧾 Fatura do tomador final ${suffixOf(invoice.takerTaxId)}: ${invoice.count} CT-e${dueDate}`,
    ),
    ...input.billingFailures.map(
      (failure) =>
        `⚠️ A fatura do tomador final ${suffixOf(failure.takerTaxId ?? '')} não saiu (${failure.code}).`,
    ),
  ]
}

function outcomeOf(status: string) {
  return classifyWhatsAppCommandDocument(status)
}

function suffixOf(taxId: string): string {
  return taxId.slice(-TAKER_SUFFIX_LENGTH)
}

/** `2026-09-27` → `27/09/2026`: a data congelada é dia civil, sem fuso a converter. */
function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function limitList(lines: readonly string[]): string[] {
  const rest = lines.length - LISTED_ITEMS_LIMIT
  const shown = lines.slice(0, LISTED_ITEMS_LIMIT)
  return rest > 0 ? [...shown, `… e mais ${rest}`] : shown
}

function limitNumbers(numbers: readonly string[]): string {
  const rest = numbers.length - LISTED_ITEMS_LIMIT
  const shown = numbers.slice(0, LISTED_ITEMS_LIMIT).join(', ')
  return rest > 0 ? `${shown} e mais ${rest}` : shown
}
