/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveProgressPercent } from '@/modules/shared/progress.service'

import type {
  BillingInvoiceSummary,
  BillingPreviewBlock,
  BillingPreviewGroup,
} from './billingClient.service'

export const BILLING_DUE_DATE_ERROR = {
  INVALID: 'invalid',
  REQUIRED: 'required',
} as const
export type BillingDueDateError =
  (typeof BILLING_DUE_DATE_ERROR)[keyof typeof BILLING_DUE_DATE_ERROR]

export const BILLING_UNKNOWN_ERROR_CODE = 'BILLING_REQUEST_FAILED'
/** Poucas faturas por vez: o lote inteiro não pode virar dezenas de requisições simultâneas. */
export const BILLING_GROUP_CONCURRENCY = 4

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

export type BillingBlockGroup = Readonly<{
  cteIds: readonly string[]
  reason: string
}>

export type BillingGroupOutcome = Readonly<{
  cteCount: number
  customerDocument: string
  errorCode?: string
  invoiceNumber?: number
}>

/** Só o contador faria a tela esperar o fim: o resultado viaja junto para aparecer grupo a grupo. */
export type BillingProgressEvent = Readonly<{
  completed: number
  outcome: BillingGroupOutcome
  total: number
}>

export type BillingProgress = Readonly<{
  completedCteCount: number
  errorCount: number
  isComplete: boolean
  percent: number
  successCount: number
  totalCteCount: number
}>

type CreateInvoicePort = Readonly<{
  createInvoice: (
    input: Readonly<{ cteIds: readonly string[]; dueDate: string; idempotencyKey: string }>,
  ) => Promise<BillingInvoiceSummary>
}>

/** `2026-02-30` passa no regex e no `Date` — só o round-trip prova que a data existe. */
export function validateBillingDueDate(value: string): BillingDueDateError | null {
  const dueDate = value.trim()
  if (dueDate.length === 0) return BILLING_DUE_DATE_ERROR.REQUIRED
  if (!CALENDAR_DATE.test(dueDate)) return BILLING_DUE_DATE_ERROR.INVALID
  const parsed = new Date(`${dueDate}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return BILLING_DUE_DATE_ERROR.INVALID
  return parsed.toISOString().slice(0, 10) === dueDate ? null : BILLING_DUE_DATE_ERROR.INVALID
}

export function groupBillingBlocksByReason(
  blocks: readonly BillingPreviewBlock[],
): readonly BillingBlockGroup[] {
  const grouped = new Map<string, string[]>()
  for (const block of blocks) {
    const cteIds = grouped.get(block.reason)
    if (cteIds === undefined) {
      grouped.set(block.reason, [block.cteId])
      continue
    }
    cteIds.push(block.cteId)
  }
  return [...grouped].map(([reason, cteIds]) => ({ cteIds, reason }))
}

function readErrorCode(caught: unknown): string {
  return caught instanceof Error && caught.message !== ''
    ? caught.message
    : BILLING_UNKNOWN_ERROR_CODE
}

async function submitBillingGroup(
  input: Readonly<{ client: CreateInvoicePort; dueDate: string; group: BillingPreviewGroup }>,
): Promise<BillingGroupOutcome> {
  try {
    const invoice = await input.client.createInvoice({
      cteIds: input.group.cteIds,
      dueDate: input.dueDate,
      idempotencyKey: crypto.randomUUID(),
    })
    return {
      cteCount: input.group.cteCount,
      customerDocument: input.group.customerDocument,
      invoiceNumber: invoice.invoiceNumber,
    }
  } catch (caught: unknown) {
    return {
      cteCount: input.group.cteCount,
      customerDocument: input.group.customerDocument,
      errorCode: readErrorCode(caught),
    }
  }
}

/**
 * Uma fatura por tomador: a API recusa em bloco uma seleção com clientes misturados. O lote inteiro
 * pode render dezenas de grupos, então a fila anda em poucas requisições por vez e avisa a cada uma.
 */
export async function submitBillingGroups(
  input: Readonly<{
    client: CreateInvoicePort
    dueDate: string
    groups: readonly BillingPreviewGroup[]
    onProgress?: (event: BillingProgressEvent) => void
  }>,
): Promise<readonly BillingGroupOutcome[]> {
  const total = input.groups.length
  const outcomes: BillingGroupOutcome[] = []
  let nextIndex = 0
  let completed = 0

  async function consumeQueue(): Promise<void> {
    for (;;) {
      const index = nextIndex
      const group = input.groups[index]
      if (group === undefined) return
      nextIndex += 1
      const outcome = await submitBillingGroup({
        client: input.client,
        dueDate: input.dueDate,
        group,
      })
      outcomes[index] = outcome
      completed += 1
      input.onProgress?.({ completed, outcome, total })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BILLING_GROUP_CONCURRENCY, total) }, consumeQueue),
  )

  return outcomes
}

/**
 * A barra mede CT-es, não requisições: grupos têm tamanhos muito diferentes (100 e 67 num lote de
 * 167), e contar grupos faria o avanço saltar de 0% para 50% sem relação com o que já saiu.
 */
export function resolveBillingProgress(
  input: Readonly<{
    completed: number
    outcomes: readonly BillingGroupOutcome[]
    total: number
    totalCteCount: number
  }>,
): BillingProgress {
  const errorCount = input.outcomes.filter((outcome) => outcome.errorCode !== undefined).length
  const completedCteCount = input.outcomes.reduce((sum, outcome) => sum + outcome.cteCount, 0)

  return {
    completedCteCount,
    errorCount,
    isComplete: input.total > 0 && input.completed >= input.total,
    percent: resolveProgressPercent({
      completed: completedCteCount,
      total: input.totalCteCount,
    }),
    successCount: input.outcomes.length - errorCount,
    totalCteCount: input.totalCteCount,
  }
}
