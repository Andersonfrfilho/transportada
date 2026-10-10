/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (api-contract): o rótulo do assunto, montado no servidor. `buildSubjectLabel` é o da lista e
 * pode levar o nome curto do destinatário (o motorista já o vê na viagem); `buildNoticeLabel` é o do
 * sino e nunca leva nome de pessoa — o aviso atravessa caixa de e-mail e log de terceiro.
 */
import {
  DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH,
  DRIVER_SUBJECT_TIME_ZONE,
} from './driver-subject-conversation.constant.js'

export type SubjectLabelFacts =
  | {
      readonly invoiceNumber: null | string
      readonly stopSequence: null | number
      readonly subjectType: 'occurrence'
      readonly typeName: string
    }
  | {
      readonly invoiceNumber: string
      readonly recipientName: null | string
      readonly subjectType: 'document'
    }
  | { readonly referenceDate: Date; readonly subjectType: 'trip' }

const LABEL_SEPARATOR = ' · '
const DAY_AND_MONTH = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: DRIVER_SUBJECT_TIME_ZONE,
})

function shortenName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH - 1).trimEnd()}…`
}

function describeOccurrence(
  facts: Extract<SubjectLabelFacts, { subjectType: 'occurrence' }>,
): string {
  if (facts.stopSequence !== null) {
    return `${facts.typeName}${LABEL_SEPARATOR}parada ${String(facts.stopSequence)}`
  }
  if (facts.invoiceNumber !== null && facts.invoiceNumber !== '') {
    return `${facts.typeName}${LABEL_SEPARATOR}NF ${facts.invoiceNumber}`
  }
  return facts.typeName
}

export function buildNoticeLabel(facts: SubjectLabelFacts): string {
  if (facts.subjectType === 'occurrence') return describeOccurrence(facts)
  if (facts.subjectType === 'document') {
    return facts.invoiceNumber === '' ? 'Nota' : `NF ${facts.invoiceNumber}`
  }
  return `Viagem de ${DAY_AND_MONTH.format(facts.referenceDate)}`
}

export function buildSubjectLabel(facts: SubjectLabelFacts): string {
  if (facts.subjectType !== 'document') return buildNoticeLabel(facts)
  const recipient = facts.recipientName === null ? '' : shortenName(facts.recipientName)
  return recipient === ''
    ? buildNoticeLabel(facts)
    : `${buildNoticeLabel(facts)}${LABEL_SEPARATOR}${recipient}`
}
