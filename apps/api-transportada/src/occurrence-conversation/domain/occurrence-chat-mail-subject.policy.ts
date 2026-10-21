/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 (D6): o assunto do chat. A linha do e-mail se mantém pelo assunto igual: vale o do último e-mail de saída
 * da ocorrência que não é encaminhamento da 248, sem acrescentar "Re:". Sem e-mail anterior, o assunto de abertura
 * leva o prefixo da transportadora da 272. Pura e idempotente.
 */
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'
import { applySubjectPrefix, cleanSubjectText } from './occurrence-mail-subject.policy.js'
import { truncateText } from './occurrence-mail-text.policy.js'

export function buildChatMailSubject(params: {
  /** `null` sem perfil fiscal: o assunto de abertura sai sem prefixo. */
  readonly carrier: { readonly cnpj: string; readonly displayName: string } | undefined
  /** O número da nota; a ocorrência de nota sempre tem, mas o dado antigo pode vir vazio. */
  readonly invoiceNumber: null | string
  readonly lastOutboundSubject: null | string
  readonly typeName: string
}): string {
  const previous = cleanSubjectText(params.lastOutboundSubject ?? '')
  if (previous !== '') return truncateText(previous, OCCURRENCE_MAIL_LIMITS.subject)
  const typeName = cleanSubjectText(params.typeName)
  const number = cleanSubjectText(params.invoiceNumber ?? '')
  const opening = `Ocorrência${typeName === '' ? '' : ` ${typeName}`}${number === '' ? '' : ` — NF ${number}`}`
  if (params.carrier === undefined) return truncateText(opening, OCCURRENCE_MAIL_LIMITS.subject)
  return applySubjectPrefix({
    cnpj: params.carrier.cnpj,
    companyDisplayName: params.carrier.displayName,
    subject: opening,
  })
}
