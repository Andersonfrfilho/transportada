/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
  NOTIFICATION_TEMPLATE_KEY,
} from './notification-schedules.constant.js'

export type NotificationTriggerInput = {
  readonly category: string
  readonly companyId: string
  /** Derivada do agregado, nunca do relógio: o ciclo seguinte não vira segundo aviso. */
  readonly dedupeKey: string
  readonly payload: Readonly<Record<string, string>>
  /** O dono do agregado. Aviso operacional tem destinatário, não plateia. */
  readonly recipientUserId: string
  readonly templateKey: string
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
    dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE}:${invoiceId}`,
    payload: {
      dueDate: DUE_DATE_FORMATTER.format(dueDate),
      invoiceNumber: invoiceNumber.toString(),
    },
    recipientUserId: actorUserId,
    templateKey: NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE,
  }
}

/**
 * A prefeitura recusou a NFS-e. A chave sai da **tentativa**: reemitir e ser recusado outra vez é
 * fato novo, e tem de avisar de novo.
 */
export function buildNfseRejectionNotification({
  actorUserId,
  attemptId,
  companyId,
  invoiceNumber,
  rejectionMessage,
}: {
  readonly actorUserId: string
  readonly attemptId: string
  readonly companyId: string
  readonly invoiceId: string
  readonly invoiceNumber: string
  readonly rejectionMessage: string
}): NotificationTriggerInput {
  return {
    category: NOTIFICATION_CATEGORY.NFSE,
    companyId,
    dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.NFSE_INVOICE_REJECTED}:${attemptId}`,
    payload: { invoiceNumber, rejectionReason: rejectionMessage },
    recipientUserId: actorUserId,
    templateKey: NOTIFICATION_TEMPLATE_KEY.NFSE_INVOICE_REJECTED,
  }
}
