/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
  NOTIFICATION_TEMPLATE_KEY,
} from '../notification.constant.js'

export type NotificationTriggerInput = {
  readonly category: string
  readonly companyId: string
  /** Derivada do agregado, nunca do relógio: reentrega da mesma mensagem não vira segundo aviso. */
  readonly dedupeKey: string
  readonly payload: Readonly<Record<string, unknown>>
  /** O dono do agregado. Aviso operacional tem destinatário, não plateia. */
  readonly recipientUserId: string
  readonly templateKey: string
}

/**
 * O lote fechou com CT-e sem autorização. O texto não carrega documento nem tomador: diz o que
 * aconteceu e manda olhar o lote, que é onde o detalhe está sob autorização.
 */
export function buildCteBatchFailureNotification({
  batchId,
  batchName,
  companyId,
  failedCount,
  operatorUserId,
}: {
  readonly batchId: string
  readonly batchName: string
  readonly companyId: string
  readonly failedCount: number
  readonly operatorUserId: string
}): NotificationTriggerInput {
  return {
    category: NOTIFICATION_CATEGORY.CTE_BATCH,
    companyId,
    dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.CTE_BATCH_ISSUANCE_FAILED}:${batchId}`,
    payload: { batchName, failedCount },
    recipientUserId: operatorUserId,
    templateKey: NOTIFICATION_TEMPLATE_KEY.CTE_BATCH_ISSUANCE_FAILED,
  }
}

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat(NOTIFICATION_DEFAULT_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  timeZone: NOTIFICATION_DEFAULT_TIMEZONE,
  year: 'numeric',
})

/**
 * A fatura vence e ainda não foi paga. O texto não carrega valor nem cliente: diz qual fatura e
 * quando, e o detalhe fica no faturamento, sob autorização.
 */
export function buildBillingInvoiceDueNotification({
  actorUserId,
  companyId,
  dueDate,
  invoiceId,
  invoiceNumber,
}: {
  readonly actorUserId: string
  readonly companyId: string
  readonly dueDate: Date
  readonly invoiceId: string
  readonly invoiceNumber: bigint
}): NotificationTriggerInput {
  return {
    category: NOTIFICATION_CATEGORY.BILLING,
    companyId,
    /** Derivada do agregado: rodar a cada batida dentro da janela não vira três dias de aviso. */
    dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE}:${invoiceId}`,
    payload: {
      dueDate: DUE_DATE_FORMATTER.format(dueDate),
      invoiceNumber: invoiceNumber.toString(),
    },
    recipientUserId: actorUserId,
    templateKey: NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE,
  }
}
