/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: as frases da ocorrência em coleta. Valem para o grupo e para a conversa individual, então
 * **nunca levam dado do cliente**: só o número da nota, o nome do item e o rótulo do tipo (configuração
 * da empresa). O número digitado e o valor pago não são repetidos em resposta nenhuma.
 */
import { DECLARED_AMOUNT_DECIMAL } from '../../shared/money.constant.js'
import { OCCURRENCE_REFERENCE_NUMBER_PATTERN } from '../../shared/trip-occurrence.constant.js'
import { formatNotUnderstood } from './whatsapp-message-format.policy.js'
import {
  OCCURRENCE_DRAFT_ITEM,
  type OccurrenceDraftQuestion,
} from './whatsapp-occurrence-draft-checklist.policy.js'

const SKIP_HINT = '_Se não tiver, responda pular._'

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`)

export type OccurrenceDraftLabels = {
  readonly declaredAmountLabel: string
  readonly referenceNumberLabel: string
}

export const OCCURRENCE_DRAFT_SPEECH = {
  amountNotUnderstood: formatNotUnderstood({
    reason: 'Digite só o valor, por exemplo 125,90, ou _pular_, se não for obrigatório.',
  }),
  downloadFailed: '⚠️ *Não consegui baixar a foto.* Mande de novo, por favor.',
  duplicatePhoto: '🔁 _Essa foto já tinha chegado._',
  missing: (
    documentNumber: string,
    missing: readonly OccurrenceDraftQuestion[],
    labels: OccurrenceDraftLabels,
  ) =>
    [
      `⚠️ *A ocorrência da NF ${documentNumber} ainda não foi registrada.*`,
      `Falta: ${missing.map((question) => describeMissing(question, labels)).join(', ')}.`,
    ].join('\n'),
  photoLimit: (documentNumber: string) =>
    `⚠️ *A ocorrência da NF ${documentNumber} já tem o máximo de fotos.*`,
  photoRejected: '⚠️ *Essa foto não pôde ser usada.* Mande outra, por favor.',
  question: (
    documentNumber: string,
    question: OccurrenceDraftQuestion,
    labels: OccurrenceDraftLabels,
  ) => describeQuestion(documentNumber, question, labels),
  received: {
    declaredAmount: '✅ _Valor anotado._',
    photo: '✅ _Foto da ocorrência recebida._',
    referenceNumber: '✅ _Número anotado._',
    skipped: '👍 _Ok, sem esse item._',
  },
  referenceNotUnderstood: formatNotUnderstood({
    reason:
      'Digite só o número (letras, números, ponto, barra ou traço, até 30), ou _pular_, se não for obrigatório.',
  }),
  stillRequired: '⚠️ _Esse item é obrigatório para registrar a ocorrência._',
} as const

function describeMissing(question: OccurrenceDraftQuestion, labels: OccurrenceDraftLabels): string {
  switch (question.item) {
    case OCCURRENCE_DRAFT_ITEM.photo:
      return photos(question.remaining)
    case OCCURRENCE_DRAFT_ITEM.referenceNumber:
      return quoted(labels.referenceNumberLabel)
    case OCCURRENCE_DRAFT_ITEM.declaredAmount:
      return quoted(labels.declaredAmountLabel)
  }
}

function describeQuestion(
  documentNumber: string,
  question: OccurrenceDraftQuestion,
  labels: OccurrenceDraftLabels,
): string {
  const head = `*Ocorrência da NF ${documentNumber}*`
  const hint = question.optional ? [SKIP_HINT] : []
  switch (question.item) {
    case OCCURRENCE_DRAFT_ITEM.photo:
      return [
        `📸 ${head}`,
        question.optional ? 'Se puder, mande uma foto.' : `Mande ${photos(question.remaining)}.`,
        ...hint,
      ].join('\n')
    case OCCURRENCE_DRAFT_ITEM.referenceNumber:
      return [`🔢 ${head}`, `Digite ${quoted(labels.referenceNumberLabel)}.`, ...hint].join('\n')
    case OCCURRENCE_DRAFT_ITEM.declaredAmount:
      return [
        `💰 ${head}`,
        `Digite ${quoted(labels.declaredAmountLabel)} (só o valor, ex.: 125,90).`,
        ...hint,
      ].join('\n')
  }
}

/** O rótulo do tipo entra entre aspas, como a empresa o escreveu: sem artigo, que dependeria do gênero. */
const quoted = (label: string) => `"${label.trim()}"`

const REFERENCE_PATTERN = new RegExp(OCCURRENCE_REFERENCE_NUMBER_PATTERN, 'u')

/** O número do documento do cliente como o motorista digitou; `null` fora do padrão do app. */
export function parseOccurrenceReferenceNumber(text: string): null | string {
  const value = text.trim().replace(/\s+/gu, ' ')
  return REFERENCE_PATTERN.test(value) ? value : null
}

/**
 * O valor pago digitado ("R$ 1.234,56", "125,90", "125.9", "80") no texto do `numeric` que a rota do app
 * aceita (`DECLARED_AMOUNT_DECIMAL`); `null` quando não é um valor.
 */
export function parseOccurrenceDeclaredAmount(text: string): null | string {
  const raw = text.replace(/r\$/giu, '').replace(/\s+/gu, '')
  if (!/^[0-9.,]+$/u.test(raw)) return null
  let integer: string
  let fraction = ''
  const comma = raw.lastIndexOf(',')
  if (comma >= 0) {
    integer = raw.slice(0, comma)
    fraction = raw.slice(comma + 1)
    if (!/^[0-9]{1,3}(?:\.?[0-9]{3})*$|^[0-9]+$/u.test(integer)) return null
    integer = integer.replace(/\./gu, '')
  } else {
    const dots = raw.split('.')
    const last = dots.at(-1) ?? ''
    if (dots.length === 2 && last.length >= 1 && last.length <= 2) {
      integer = dots[0] ?? ''
      fraction = last
    } else if (/^[0-9]{1,3}(?:\.[0-9]{3})*$|^[0-9]+$/u.test(raw)) {
      integer = raw.replace(/\./gu, '')
    } else {
      return null
    }
  }
  if (!/^[0-9]*$/u.test(fraction) || fraction.length > 2) return null
  const normalized = `${integer.replace(/^0+(?=\d)/u, '') || '0'}${fraction === '' ? '' : `.${fraction}`}`
  return DECLARED_AMOUNT_DECIMAL.test(normalized) ? normalized : null
}
