/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: os nomes e os tetos do recebimento de XML de NF-e por e-mail e WhatsApp. Volume nunca recusa — vira fila;
 * só a segurança recusa (remetente, tipo de arquivo, tamanho por arquivo).
 */

/** Quem pode importar: os papéis que a API autoriza em `invoices.import` (cópia por valor). */
export const NFE_IMPORT_ROLES = ['company-admin', 'fiscal', 'operator'] as const

/** A caixa de notas é `notas@<domínio de entrada>`; o local-part é o que diz que o e-mail é de XML. */
export const NFE_XML_MAILBOX_LOCAL_PART = 'notas'

/** Contexto de auditoria da importação feita pela caixa de e-mail (sem usuário logado). */
export const NFE_XML_MAILBOX_AUTOMATION_JOB = 'nfe.xml.mailbox'

export const NFE_XML_RECEIPT_LIMITS = {
  /** Um arquivo (XML ou zip) acima disto é recusado: o zip é expandido no worker com teto próprio. */
  maxFileBytes: 50 * 1024 * 1024,
  /** Quantos recibos do WhatsApp o worker baixa por ciclo: o resto espera a vez, nada é recusado. */
  whatsappBatchSize: 20,
  /** Quantas tentativas antes de o recibo virar `failed` (com aviso ao remetente e à operação). */
  maxAttempts: 5,
  retryBackoffSeconds: [60, 300, 900, 3600, 10800],
  /** Recibo `processing` há mais que isto voltou de um worker que caiu: reentra na fila. */
  staleProcessingSeconds: 15 * 60,
  /** Resumos por ciclo, para o remetente nunca receber uma rajada. */
  summaryBatchSize: 50,
  /** Quantas vezes se tenta mandar o resumo antes de desistir (e deixar o log dizer). */
  summaryMaxAttempts: 5,
} as const

export const NFE_XML_RECEIPT_REJECTION = {
  mailboxNotConfigured: 'mailbox_not_configured',
  noAcceptedFile: 'no_accepted_file',
  senderNotAllowed: 'sender_not_allowed',
  senderNotAuthenticated: 'sender_not_authenticated',
  tooLarge: 'file_too_large',
} as const
export type NfeXmlReceiptRejection =
  (typeof NFE_XML_RECEIPT_REJECTION)[keyof typeof NFE_XML_RECEIPT_REJECTION]

export const NFE_XML_RECEIPT_LOG = {
  acknowledged: 'nfe_xml_receipt_acknowledged',
  batch: 'nfe_xml_receipt_batch',
  failed: 'nfe_xml_receipt_failed',
  imported: 'nfe_xml_receipt_imported',
  rejected: 'nfe_xml_receipt_rejected',
  retry: 'nfe_xml_receipt_retry',
  summarySent: 'nfe_xml_receipt_summary_sent',
} as const
