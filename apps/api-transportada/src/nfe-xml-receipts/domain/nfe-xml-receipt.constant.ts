/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o que o webhook do WhatsApp sabe do recebimento de XML. O worker dá o resto (baixa, importa, responde).
 * ⚠️ Os valores de recusa e o teto de arquivo são cópia por valor de `worker-transportada/src/nfe-xml-receipts/domain`.
 */
import { COMPANY_ROLE_PERMISSIONS } from '../../identity/domain/authorization.policy.js'
import type { CompanyRole } from '../../database/identity.schema.js'

export const NFE_XML_RECEIPT_MAX_FILE_BYTES = 50 * 1024 * 1024

export const NFE_XML_RECEIPT_REJECTION = {
  senderNotAllowed: 'sender_not_allowed',
  tooLarge: 'file_too_large',
} as const

/** Quem pode importar nota: os papéis da empresa que carregam `invoices.import`. */
export const NFE_XML_IMPORT_ROLES: readonly CompanyRole[] = (
  Object.entries(COMPANY_ROLE_PERMISSIONS) as [CompanyRole, readonly string[]][]
)
  .filter(([, permissions]) => permissions.includes('invoices.import'))
  .map(([role]) => role)

export const NFE_XML_RECEIPT_LOG = {
  received: 'nfe_xml_receipt.whatsapp_received',
} as const
