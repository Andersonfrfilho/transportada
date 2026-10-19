/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 (D6): o assunto do chat. A linha do e-mail se mantém pelo assunto igual: vale o do último e-mail de saída
 * da ocorrência que não é encaminhamento da 248, sem acrescentar "Re:". Sem e-mail anterior, o assunto de abertura
 * leva o prefixo da transportadora da 272. Pura e idempotente.
 */
import { applySubjectPrefix } from './occurrence-mail-subject.policy.js'

export function buildChatMailSubject(params: {
  /** `null` sem perfil fiscal: o assunto de abertura sai sem prefixo. */
  readonly carrier: { readonly cnpj: string; readonly displayName: string } | undefined
  /** O número da nota; a ocorrência de nota sempre tem, mas o dado antigo pode vir vazio. */
  readonly invoiceNumber: null | string
  readonly lastOutboundSubject: null | string
  readonly typeName: string
}): string {
  const previous = params.lastOutboundSubject?.trim() ?? ''
  if (previous !== '') return previous
  const number = params.invoiceNumber?.trim() ?? ''
  const opening = `Ocorrência ${params.typeName.trim()}${number === '' ? '' : ` — NF ${number}`}`
  if (params.carrier === undefined) return opening
  return applySubjectPrefix({
    cnpj: params.carrier.cnpj,
    companyDisplayName: params.carrier.displayName,
    subject: opening,
  })
}
