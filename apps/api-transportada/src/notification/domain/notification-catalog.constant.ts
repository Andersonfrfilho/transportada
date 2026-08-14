/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NOTIFICATION_CHANNEL } from '@adatechnology/notification-contracts'

/**
 * O assunto da notificação, do ponto de vista de quem recebe — não do módulo que entrega. O pacote
 * aceita `category` como string livre; aqui ela é fechada, porque é por categoria que o
 * destinatário liga e desliga canal na tela de preferências.
 */
export const NOTIFICATION_CATEGORY = {
  BILLING: 'billing',
  CTE_BATCH: 'cte-batch',
  IDENTITY: 'identity',
  NFSE: 'nfse',
} as const
export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORY)[keyof typeof NOTIFICATION_CATEGORY]

/**
 * Os canais que este produto entrega. O módulo conhece push, WhatsApp e SMS; nenhum deles tem
 * driver configurado aqui, e oferecê-los na tela prometeria entrega que não sai.
 */
export const NOTIFICATION_PRODUCT_CHANNELS = [
  NOTIFICATION_CHANNEL.INBOX,
  NOTIFICATION_CHANNEL.EMAIL,
] as const
export type NotificationProductChannel = (typeof NOTIFICATION_PRODUCT_CHANNELS)[number]

/** A chave é identidade de negócio do template: renomear quebra template já publicado no banco. */
export const NOTIFICATION_TEMPLATE_KEY = {
  BILLING_INVOICE_DUE: 'billing.invoice-due',
  CTE_BATCH_ISSUANCE_FAILED: 'cte-batch.issuance-failed',
  NFSE_INVOICE_REJECTED: 'nfse.invoice-rejected',
} as const
export type NotificationTemplateKey =
  (typeof NOTIFICATION_TEMPLATE_KEY)[keyof typeof NOTIFICATION_TEMPLATE_KEY]

export type NotificationCatalogTemplate = {
  readonly body: string
  readonly subject?: string
}

export type NotificationCatalogEntry = {
  readonly category: NotificationCategory
  readonly channels: readonly NotificationProductChannel[]
  /** Os marcadores que o disparo tem de preencher; ausente, o texto renderiza um buraco. */
  readonly placeholders: readonly string[]
  readonly templateKey: NotificationTemplateKey
  readonly templates: Partial<Record<NotificationProductChannel, NotificationCatalogTemplate>>
}

/**
 * Os três disparos que já têm dono no produto. Texto curto e sem PII: a caixa de entrada e o
 * e-mail dizem o que aconteceu e onde olhar, e o detalhe fica na tela.
 */
export const NOTIFICATION_CATALOG: readonly NotificationCatalogEntry[] = [
  {
    category: NOTIFICATION_CATEGORY.CTE_BATCH,
    channels: NOTIFICATION_PRODUCT_CHANNELS,
    placeholders: ['batchName', 'failedCount'],
    templateKey: NOTIFICATION_TEMPLATE_KEY.CTE_BATCH_ISSUANCE_FAILED,
    templates: {
      email: {
        body: 'O lote {{batchName}} terminou com {{failedCount}} CT-e sem autorização.\nAbra o lote no TransportAdA para ver a rejeição de cada documento.',
        subject: 'Falha na emissão do lote {{batchName}}',
      },
      inbox: {
        body: 'O lote {{batchName}} terminou com {{failedCount}} CT-e sem autorização.',
      },
    },
  },
  {
    category: NOTIFICATION_CATEGORY.NFSE,
    channels: NOTIFICATION_PRODUCT_CHANNELS,
    placeholders: ['invoiceNumber', 'rejectionReason'],
    templateKey: NOTIFICATION_TEMPLATE_KEY.NFSE_INVOICE_REJECTED,
    templates: {
      email: {
        body: 'A NFS-e {{invoiceNumber}} foi rejeitada pela prefeitura.\nMotivo informado: {{rejectionReason}}',
        subject: 'NFS-e {{invoiceNumber}} rejeitada',
      },
      inbox: {
        body: 'A NFS-e {{invoiceNumber}} foi rejeitada: {{rejectionReason}}',
      },
    },
  },
  {
    category: NOTIFICATION_CATEGORY.BILLING,
    channels: NOTIFICATION_PRODUCT_CHANNELS,
    placeholders: ['dueDate', 'invoiceNumber'],
    templateKey: NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE,
    templates: {
      email: {
        body: 'A fatura {{invoiceNumber}} vence em {{dueDate}}.\nAbra o faturamento no TransportAdA para conferir os CT-es dela.',
        subject: 'Fatura {{invoiceNumber}} vence em {{dueDate}}',
      },
      inbox: {
        body: 'A fatura {{invoiceNumber}} vence em {{dueDate}}.',
      },
    },
  },
]
