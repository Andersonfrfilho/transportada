/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 (RF1, RF10, RF13): a pergunta do comprovante no padrão — título em negrito, cliente em citação onde a
 * pergunta é sobre quem recebeu, e o contador do que falta em toda pergunta. Funções puras.
 */
import {
  DELIVERY_PROOF_ITEM,
  type DeliveryProofItem,
  type DeliveryProofQuestion,
} from './whatsapp-delivery-proof-checklist.policy.js'
import { RECEIVED_BY_MESSAGE_OPTIONS } from './whatsapp-delivery-received-by.constant.js'
import { formatOptions, formatReplyHint } from './whatsapp-message-format.policy.js'

export type DeliveryProofClient = {
  readonly city?: string | undefined
  readonly name: string
}

export type DeliveryProofQuestionView = {
  readonly client?: DeliveryProofClient | undefined
  /** O que ainda falta, a pergunta de agora incluída (`checklist.pendingItems`). */
  readonly pendingItems: readonly DeliveryProofQuestion[]
}

const SKIP_HINT = 'Se não tiver, responda pular.'

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`)

function describePendingItem(question: DeliveryProofQuestion): string {
  switch (question.item) {
    case DELIVERY_PROOF_ITEM.photo:
      return 'canhoto'
    case DELIVERY_PROOF_ITEM.cargo:
      return question.remaining > 1
        ? `${question.remaining} fotos da mercadoria`
        : 'foto da mercadoria'
    case DELIVERY_PROOF_ITEM.receivedBy:
      return 'quem recebeu'
    case DELIVERY_PROOF_ITEM.receiverName:
      return 'o nome'
    case DELIVERY_PROOF_ITEM.location:
      return 'localização'
  }
}

/** RF10: "Faltam 3 itens: canhoto, foto da mercadoria e quem recebeu." / "Falta 1 item."; sem nada pendente, nada. */
export function describeProofCounter(items: readonly DeliveryProofQuestion[]): string | undefined {
  if (items.length === 0) return undefined
  if (items.length === 1) return 'Falta 1 item.'
  const labels = items.map(describePendingItem)
  const last = labels.pop()
  return `Faltam ${items.length} itens: ${labels.join(', ')} e ${last}.`
}

function describeClientQuote(client: DeliveryProofClient | undefined): string | undefined {
  if (client === undefined || client.name === '') return undefined
  const city = client.city === undefined || client.city === '' ? '' : ` · ${client.city}`
  return `> 🏪 *${client.name}*${city}`
}

/** Contador e "pular" na mesma linha; o contador sozinho vai depois de uma linha em branco. */
function describeFooter(question: DeliveryProofQuestion, view: DeliveryProofQuestionView) {
  const counter = describeProofCounter(view.pendingItems)
  const text = [counter, question.optional ? SKIP_HINT : undefined]
    .filter((part): part is string => part !== undefined)
    .join(' ')
  if (text === '') return []
  return question.optional ? [formatReplyHint(text)] : ['', formatReplyHint(text)]
}

function describeTitle(documentNumber: string, item: DeliveryProofItem): string {
  const note = `NF \`${documentNumber}\``
  switch (item) {
    case DELIVERY_PROOF_ITEM.location:
      return `📍 *${note} · localização*`
    case DELIVERY_PROOF_ITEM.photo:
      return `📸 *${note} · foto do canhoto*`
    case DELIVERY_PROOF_ITEM.cargo:
      return `📦 *${note} · foto da mercadoria*`
    case DELIVERY_PROOF_ITEM.receivedBy:
      return `👤 *Quem recebeu a ${note}?*`
    case DELIVERY_PROOF_ITEM.receiverName:
      return `✍️ *Qual o nome de quem recebeu a ${note}?*`
  }
}

function describeBody(question: DeliveryProofQuestion): string {
  switch (question.item) {
    case DELIVERY_PROOF_ITEM.location:
      return 'Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).'
    case DELIVERY_PROOF_ITEM.photo:
      return 'Mande a foto do canhoto assinado.'
    case DELIVERY_PROOF_ITEM.cargo:
      return `Mande ${photos(Math.max(1, question.remaining))} da mercadoria entregue.`
    case DELIVERY_PROOF_ITEM.receivedBy:
      return formatOptions(RECEIVED_BY_MESSAGE_OPTIONS)
    case DELIVERY_PROOF_ITEM.receiverName:
      return 'Escreva o nome.'
  }
}

export function describeProofQuestion(
  documentNumber: string,
  question: DeliveryProofQuestion,
  view: DeliveryProofQuestionView,
): string {
  const quote = describeClientQuote(view.client)
  const isPersonQuestion =
    question.item === DELIVERY_PROOF_ITEM.receivedBy ||
    question.item === DELIVERY_PROOF_ITEM.receiverName
  const footer = describeFooter(question, view)
  const isReceivedBy = question.item === DELIVERY_PROOF_ITEM.receivedBy
  const lines = [
    describeTitle(documentNumber, question.item),
    ...(isPersonQuestion && quote !== undefined ? [quote, ''] : []),
    describeBody(question),
    ...(isReceivedBy && footer[0] !== '' && footer.length > 0 ? ['', ...footer] : footer),
    ...(isReceivedBy ? [formatReplyHint('Responda com o número.')] : []),
  ]
  return lines.join('\n')
}
