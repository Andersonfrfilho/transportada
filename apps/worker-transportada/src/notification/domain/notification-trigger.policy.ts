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

const MILLISECONDS_PER_DAY = 86_400_000

/** Os dias que faltam em que o aviso sai: quanto mais perto, mais um lembrete. */
export const CERTIFICATE_EXPIRY_WARNING_DAYS = [30, 15, 7, 3, 1] as const

export type CertificateExpiryStage =
  | { readonly kind: 'expired' }
  | { readonly daysLeft: number; readonly kind: 'expiring'; readonly warningDay: number }

/**
 * Em que ponto da régua o certificado está. `warningDay` é o menor degrau que ainda cobre os dias
 * que faltam, e é ele que entra na chave de deduplicação: cada degrau avisa uma vez, e correr a
 * rotina de cinco em cinco minutos não repete. Fora da janela de trinta dias não há aviso (`null`).
 */
export function classifyCertificateExpiry({
  expiresAt,
  now,
}: {
  readonly expiresAt: Date
  readonly now: Date
}): CertificateExpiryStage | null {
  const remaining = expiresAt.getTime() - now.getTime()
  if (remaining <= 0) return { kind: 'expired' }

  const daysLeft = Math.ceil(remaining / MILLISECONDS_PER_DAY)
  const warningDay = [...CERTIFICATE_EXPIRY_WARNING_DAYS].reverse().find((day) => daysLeft <= day)
  if (warningDay === undefined) return null

  return { daysLeft, kind: 'expiring', warningDay }
}

/**
 * O certificado A1 vence e a importação e a emissão param junto. O texto traz a data e os dias que
 * faltam; quem recebe é quem enviou o certificado, e o envio do novo é em Configurações da empresa.
 */
export function buildCertificateExpiryNotification({
  certificateId,
  companyId,
  expiresAt,
  recipientUserId,
  stage,
}: {
  readonly certificateId: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly recipientUserId: string
  readonly stage: CertificateExpiryStage
}): NotificationTriggerInput {
  const formattedExpiresAt = DUE_DATE_FORMATTER.format(expiresAt)

  if (stage.kind === 'expired') {
    return {
      category: NOTIFICATION_CATEGORY.FISCAL,
      companyId,
      dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRED}:${certificateId}`,
      payload: { expiresAt: formattedExpiresAt },
      recipientUserId,
      templateKey: NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRED,
    }
  }

  return {
    category: NOTIFICATION_CATEGORY.FISCAL,
    companyId,
    dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRING}:${certificateId}:${stage.warningDay}`,
    payload: { daysLeft: String(stage.daysLeft), expiresAt: formattedExpiresAt },
    recipientUserId,
    templateKey: NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRING,
  }
}
