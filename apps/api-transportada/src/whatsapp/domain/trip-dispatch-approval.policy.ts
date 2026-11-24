/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O motorista manda "saí"/"cheguei" numa viagem planejada e ainda não despachada: o bot pergunta ao responsável do
 * escritório (quem planejou) se a viagem pode ser despachada. Funções puras: o prazo, a leitura da resposta e as
 * frases saem daqui.
 */
import { formatNextStep } from '../../whatsapp-commands/domain/whatsapp-message-format.policy.js'

/** O prazo para o escritório responder, com um reaviso na metade. */
export const TRIP_DISPATCH_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000
export const TRIP_DISPATCH_APPROVAL_REMINDER_AFTER_MS = 5 * 60 * 1000

export type PendingDriverStopEvent = {
  readonly documentNumber?: string
  readonly event: 'arrive' | 'depart'
  /** A hora da mensagem do motorista (ISO): o lançamento no despacho vale por ela, não pela hora da aprovação. */
  readonly sentAt: string
  readonly stopId: string
}

export type DispatchAnswer = 'no' | 'yes'

const YES_WORDS = new Set([
  'sim',
  's',
  'ok',
  'pode',
  'autorizo',
  'autorizado',
  'aprovo',
  'aprovado',
  'despacha',
  'despache',
  'despachar',
  'liberado',
  'libera',
  'claro',
  'positivo',
  'yes',
])
const NO_WORDS = new Set([
  'nao',
  'n',
  'negativo',
  'recuso',
  'recusado',
  'aguarde',
  'aguardar',
  'espera',
  'espere',
  'cancela',
  'cancelar',
])

/**
 * "sim"/"pode despachar" aprova; "não"/"aguarde" recusa. Frase com as duas famílias, ou sem nenhuma ("talvez"),
 * não é resposta: o bot repete a pergunta em vez de despachar por palpite.
 */
export function interpretDispatchAnswer(text: string): DispatchAnswer | null {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
  if (words.length === 0 || words.length > 6) return null
  const yes = words.some((word) => YES_WORDS.has(word))
  const no = words.some((word) => NO_WORDS.has(word))
  if (yes === no) return null
  return yes ? 'yes' : 'no'
}

/** O que o bot conta ao motorista de cada parada enfileirada ("saída" / "chegada"). */
export function describePendingEvent(event: PendingDriverStopEvent): string {
  return event.event === 'depart' ? 'saída' : 'chegada'
}

export const DISPATCH_APPROVAL_TEXT = {
  alreadyAsked:
    '⏳ *Já pedi ao escritório para despachar a viagem.* Assim que responderem eu lanço o que você mandou.',
  asked: (names: { readonly events: readonly PendingDriverStopEvent[] }) =>
    [
      '🚚 *Esta viagem ainda não foi despachada.*',
      `Pedi ao escritório para despachar e, se autorizarem, eu lanço a ${joinEvents(names.events)} que você mandou.`,
      formatNextStep('aguarde a resposta (até 10 minutos).'),
    ].join('\n'),
  cargoOpenDriver: [
    '🚚 *Esta viagem ainda não foi despachada.*',
    'Avisei o escritório, mas a carga ainda não está fechada e ela só sai pelo painel.',
    formatNextStep('fale com o escritório; depois que despacharem, mande de novo.'),
  ].join('\n'),
  cargoOpenOffice: (driverName: string) =>
    [
      `🚚 *${driverName} mandou saída/chegada, mas a viagem não foi despachada.*`,
      'A carga ainda não está fechada, então não despacho pelo WhatsApp.',
      formatNextStep('despache a viagem pelo painel.'),
    ].join('\n'),
  declinedDriver: [
    '🚫 *O escritório não autorizou o despacho agora.* Nada foi lançado.',
    formatNextStep('fale com o escritório.'),
  ].join('\n'),
  declinedOffice: '👍 *Certo, não despachei.* Avisei o motorista.',
  dispatchedDriver: (events: readonly PendingDriverStopEvent[]) =>
    `✅ *Viagem despachada pelo escritório.* Lancei a ${joinEvents(events)} que você mandou.`,
  dispatchedOffice: '✅ *Viagem despachada.* Lancei o que o motorista mandou e avisei o grupo.',
  dispatchFailedDriver: [
    '⚠️ *Não consegui despachar a viagem.* Nada foi lançado.',
    formatNextStep('fale com o escritório.'),
  ].join('\n'),
  dispatchFailedOffice: [
    '⚠️ *Não consegui despachar pelo WhatsApp.*',
    formatNextStep('despache a viagem pelo painel.'),
  ].join('\n'),
  expiredDriver: [
    '⏰ *O escritório não respondeu a tempo.* Nada foi lançado e a viagem segue sem despachar.',
    formatNextStep('fale com o escritório.'),
  ].join('\n'),
  expiredOffice: '⏰ *O pedido de despacho venceu.* Nada foi despachado.',
  noResponder: [
    '🚚 *Esta viagem ainda não foi despachada,* então não consigo registrar a saída nem a chegada.',
    formatNextStep('fale com o escritório para despachar a viagem.'),
  ].join('\n'),
  notAllowed: '🔒 *Só quem pode despachar viagens responde a este pedido.* Nada foi despachado.',
  notUnderstood: '❓ Não entendi. Responda *sim* para despachar ou *não* para recusar.',
  question: (input: {
    readonly driverName: string
    readonly events: readonly PendingDriverStopEvent[]
  }) =>
    [
      `🚚 *${input.driverName} mandou a ${joinEvents(input.events)}, mas a viagem ainda não foi despachada.*`,
      'Posso despachar agora e lançar o que ele mandou, com a hora em que mandou?',
      formatNextStep('responda *sim* para despachar ou *não* para recusar (até 10 minutos).'),
    ].join('\n'),
  reminder: '⏳ *Ainda aguardo sua resposta* sobre o despacho da viagem: *sim* ou *não*.',
} as const

function joinEvents(events: readonly PendingDriverStopEvent[]): string {
  const names = [...new Set(events.map((event) => describePendingEvent(event)))]
  return names.join(' e a ')
}
