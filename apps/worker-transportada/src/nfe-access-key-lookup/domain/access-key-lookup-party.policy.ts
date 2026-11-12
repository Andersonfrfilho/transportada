/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'

import { normalizeTaxId } from '../../shared/tax-id.service.js'

const AUT_XML_CNPJ_PATTERN =
  /<(?:[A-Za-z0-9._-]+:)?autXML>\s*<(?:[A-Za-z0-9._-]+:)?CNPJ>\s*([A-Za-z0-9]{14})\s*</g

/** O pacote fiscal não expõe o `autXML` (quem foi autorizado a baixar o XML): lê-se do próprio XML. */
export function collectAutXmlCnpjs(xml: string): readonly string[] {
  return [...xml.matchAll(AUT_XML_CNPJ_PATTERN)].flatMap((match) => (match[1] ? [match[1]] : []))
}

/** Emitente, destinatário, transportador ou autorizado a baixar: só quem é parte guarda o XML. */
export function isCompanyPartyOfDocument(params: {
  readonly autXmlCnpjs: readonly string[]
  readonly companyCnpj: string
  readonly document: NfeXmlDocument
}): boolean {
  const { autXmlCnpjs, companyCnpj, document } = params
  const company = normalizeTaxId(companyCnpj)
  const partyTaxIds = [
    document.issuer.taxId,
    document.recipient?.taxId,
    document.carrier?.taxId,
    ...autXmlCnpjs,
  ]
  return partyTaxIds.some((taxId) => taxId !== undefined && normalizeTaxId(taxId) === company)
}
