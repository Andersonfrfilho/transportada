/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T11 — **o que o bot responde depois de um evento da entrega**, para os dois canais, num
 * lugar só. O resultado tipado de `whatsapp-driver-events.service.ts` vira uma `BotSpeechLine`: chave
 * do catálogo editável (`fala_*` do grafo raiz, spec 286 T8) ou texto pronto de uma política que já
 * tinha a frase (portão de estado, exigência do tipo).
 *
 * Duas plateias:
 * - `driver`: a conversa individual. As frases são as que o fluxo da spec 144 já usava.
 * - `group`: o grupo do motorista. **Sem dado de cliente**: só o número da nota, nunca nome,
 *   endereço, documento de quem recebeu nem valor (spec 292). A localização e as provas não são
 *   repetidas na resposta.
 */
import type { StopEventStep } from '../../trips/domain/stop-event-sequence.policy.js'
import type { BotSpeechKey } from '../domain/whatsapp-bot-speech.constant.js'
import { formatNextStep } from '../domain/whatsapp-message-format.policy.js'
import { formatBotClock } from '../domain/whatsapp-stop-card.policy.js'
import type { DriverReturnReason } from '../../trips/domain/driver-return-reason.policy.js'
import {
  describeReturnReasonOption,
  DRIVER_TRANSITION_BLOCK_MESSAGES,
} from '../domain/whatsapp-driver-flow.constant.js'
import type { BotSpeechLine } from './whatsapp-bot-speech.service.js'
import {
  WHATSAPP_DRIVER_EVENT,
  type OccurrenceRequirementField,
  type WhatsAppDriverEvent,
  type WhatsAppDriverEventRefusal,
  type WhatsAppDriverEventResult,
} from './whatsapp-driver-events.service.js'

export type WhatsAppDriverEventAudience =
  | {
      readonly documentNumber?: string
      readonly kind: 'driver'
      /** O motivo da devolução, para a frase "NF … não entregue · <motivo>". */
      readonly returnReason?: DriverReturnReason
      readonly stopSequence?: number
      readonly time?: string
    }
  /** `documentNumber` é o número da NF (o único dado da nota que aparece no grupo). */
  | {
      readonly documentNumber?: string
      readonly kind: 'group'
      readonly returnReason?: DriverReturnReason
      readonly stopSequence?: number
      readonly time?: string
    }

const APP_ONLY_TITLE = '📱 *Esta ocorrência é registrada pelo aplicativo.*'

function describeAppOnly(reason: string): string {
  return [APP_ONLY_TITLE, reason, formatNextStep('abra o app e toque em *Ocorrência*.')].join('\n')
}

/** Spec 270 (R3): a frase dos dois canais quando o servidor recusa o tipo pela contratante. */
export const OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE = [
  '🚫 *Este tipo não vale para a contratante desta nota.*',
  formatNextStep('escolha outro tipo.'),
].join('\n')

/**
 * Spec 246 (RF13): o campo que o tipo exige e o WhatsApp ainda não colhe. A T15 da 293 passa a colher
 * foto, número e valor; até lá a frase manda para o app.
 */
export const OCCURRENCE_REQUIREMENT_MESSAGES: Readonly<Record<OccurrenceRequirementField, string>> =
  {
    contractor_scope: OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE,
    declared_amount: describeAppOnly(
      'Essa ocorrência pede o valor pago e as quantidades, e o WhatsApp não os envia.',
    ),
    items: describeAppOnly(
      'Essa ocorrência pede para apontar os produtos da nota, e isso o WhatsApp não faz.',
    ),
    note: [
      '📝 *Essa ocorrência exige a observação.*',
      formatNextStep('digite o que aconteceu.'),
    ].join('\n'),
    photo: describeAppOnly('Essa ocorrência pede foto, e o WhatsApp não envia foto.'),
    reference_number: describeAppOnly(
      'Essa ocorrência pede o número do documento do cliente, e o WhatsApp não o envia.',
    ),
    signature: describeAppOnly(
      'Essa ocorrência pede a assinatura de quem recebeu, e o WhatsApp não envia assinatura.',
    ),
  }

const DRIVER_REGISTERED: Readonly<Record<WhatsAppDriverEvent, BotSpeechKey>> = {
  arrive: 'arrivalRegistered',
  deliver: 'deliveryRegistered',
  depart: 'departureRegistered',
  occurrence: 'occurrenceRegistered',
  return: 'returnRegistered',
}

const STOP_EVENTS: ReadonlySet<WhatsAppDriverEvent> = new Set([
  WHATSAPP_DRIVER_EVENT.arrive,
  WHATSAPP_DRIVER_EVENT.depart,
])

/** Spec 294 RF14: a chegada com ponto atualiza o endereço ou manda a sugestão ao escritório. */
export const ADDRESS_CORRECTION_TEXT = {
  applied: '✅ _Endereço corrigido pela sua localização._',
  suggested: '📬 _Enviei para o escritório conferir o endereço._',
} as const

const STEP_WORDS = { arrived: 'a chegada', departed: 'a saída' } as const

const COMPANION_WORDS: Readonly<Record<WhatsAppDriverEvent, string>> = {
  arrive: 'a chegada',
  depart: 'a saída',
  deliver: 'a entrega',
  occurrence: 'a ocorrência',
  return: 'a devolução',
}

/** Spec 294 RF5: avisa a etapa que a API marcou junto — "Marquei a chegada junto com a entrega da NF 17234.". */
export function describeRecordedTogether(input: {
  readonly documentNumber?: string | undefined
  readonly event: WhatsAppDriverEvent
  readonly steps: readonly StopEventStep[]
}): string | undefined {
  if (input.steps.length === 0) return undefined
  const marked = input.steps.map((step) => STEP_WORDS[step]).join(' e ')
  // A entrega já diz a nota na primeira linha: a frase de apoio vai em itálico e sem repeti-la (spec 300, fluxo 5).
  if (input.event === WHATSAPP_DRIVER_EVENT.deliver) {
    return `_Marquei ${marked} junto com ${COMPANION_WORDS[input.event]}._`
  }
  const note = input.documentNumber === undefined ? '' : ` da NF ${input.documentNumber}`
  return `Marquei ${marked} junto com ${COMPANION_WORDS[input.event]}${note}.`
}

/** A resposta ao evento, já na plateia certa. */
export function describeWhatsAppDriverEventResult(
  result: WhatsAppDriverEventResult,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine {
  const line = describeMainLine(result, audience)
  if (result.kind !== 'registered') return line
  const together = describeRecordedTogether({
    documentNumber: audience.documentNumber,
    event: result.event,
    steps: result.recordedTogether ?? [],
  })
  const after = [
    ...(together === undefined ? [] : [together]),
    ...(result.addressCorrection === undefined
      ? []
      : [ADDRESS_CORRECTION_TEXT[result.addressCorrection]]),
  ]
  return after.length === 0 ? line : { ...line, after }
}

function describeMainLine(
  result: WhatsAppDriverEventResult,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine {
  if (result.kind === 'refused') return describeWhatsAppDriverEventRefusal(result.refusal, audience)
  const delivered = describeDeliveredLine(result, audience)
  if (delivered !== undefined) return delivered
  const returned = describeReturnedLine(result, audience)
  if (returned !== undefined) return returned
  const documentNumber = audience.kind === 'group' ? audience.documentNumber : undefined
  // Saí/cheguei não citam nota; sem número da nota, o grupo ouve a frase do motorista (sem dado).
  if (documentNumber === undefined || STOP_EVENTS.has(result.event)) {
    if (result.kind === 'already_registered') return { key: 'alreadyRegistered' }
    const key = DRIVER_REGISTERED[result.event]
    if (!STOP_EVENTS.has(result.event)) return { key }
    return { key, params: { time: audience.time ?? formatBotClock(new Date()) } }
  }
  const params = { documentNumber }
  if (result.kind === 'already_registered') return { key: 'groupAlreadyRegistered', params }
  if (result.event === WHATSAPP_DRIVER_EVENT.deliver) {
    return { key: 'groupDeliveryRegistered', params }
  }
  // Devolução sem o motivo conhecido: a fala curta, sem inventar a frase do motivo.
  if (result.event === WHATSAPP_DRIVER_EVENT.return) return { key: 'returnRegistered' }
  return { key: 'groupOccurrenceRegistered', params }
}

/** Spec 300 (RF1): a entrega registrada diz a nota e a parada, igual nos dois canais; sem nota, a fala de antes. */
function describeDeliveredLine(
  result: WhatsAppDriverEventResult,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine | undefined {
  const { documentNumber, stopSequence } = audience
  if (result.kind !== 'registered' || result.event !== WHATSAPP_DRIVER_EVENT.deliver) {
    return undefined
  }
  if (documentNumber === undefined) return undefined
  const isStopClosed =
    result.details?.stopCompleted === true || result.details?.tripCompleted === true
  if (!isStopClosed || stopSequence === undefined) {
    return { key: 'groupDeliveryRegistered', params: { documentNumber } }
  }
  const key =
    result.details?.tripCompleted === true
      ? 'groupDeliveryTripCompleted'
      : 'groupDeliveryStopCompleted'
  return { key, params: { documentNumber, sequence: stopSequence } }
}

/** Spec 300 (RF1): a devolução registrada diz a nota e o motivo, igual nos dois canais; sem os dois, a fala de antes. */
function describeReturnedLine(
  result: WhatsAppDriverEventResult,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine | undefined {
  const { documentNumber, returnReason } = audience
  if (result.kind !== 'registered' || result.event !== WHATSAPP_DRIVER_EVENT.return) {
    return undefined
  }
  if (documentNumber === undefined || returnReason === undefined) return undefined
  return {
    key: 'groupReturnRegistered',
    params: { documentNumber, reason: describeReturnReasonOption(returnReason).action },
  }
}

export function describeWhatsAppDriverEventRefusal(
  refusal: WhatsAppDriverEventRefusal,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine {
  const group = audience.kind === 'group'
  switch (refusal.code) {
    case 'driver_not_linked':
      return { key: 'driverNotLinked' }
    case 'driver_without_access':
      return { key: group ? 'groupDriverWithoutAccess' : 'driverNotLinked' }
    case 'document_not_reachable':
      return { key: group ? 'groupDocumentNotReachable' : 'driverDocumentNotReachable' }
    case 'stop_not_reachable':
      return { key: 'stopNotReachable' }
    case 'stop_en_route':
      return { key: 'stopEnRoute', params: { sequence: refusal.enRouteStopSequence } }
    case 'stop_out_of_order':
      return { text: describeOutOfOrderStop(refusal) }
    case 'transition_blocked': {
      const message = DRIVER_TRANSITION_BLOCK_MESSAGES[refusal.reason]
      const documentNumber = group ? audience.documentNumber : undefined
      return { text: documentNumber === undefined ? message : `NF ${documentNumber}: ${message}` }
    }
    case 'occurrence_requirement':
      return { text: OCCURRENCE_REQUIREMENT_MESSAGES[refusal.field] }
  }
}

/** Erro que não é de negócio, no grupo: o pedido fecha com o convite a tentar de novo. */
export const WHATSAPP_GROUP_EVENT_FAILED: BotSpeechLine = { key: 'groupRegisterFailed' }

function describeOutOfOrderStop(refusal: {
  readonly currentSequence: number | null
  readonly nextSequence: number | null
  readonly requestedSequence: number
}): string {
  const expected = refusal.currentSequence ?? refusal.nextSequence
  const reference = expected === null ? 'a parada em andamento' : `a parada ${expected}`
  return `Essa não é a parada em andamento: o roteiro pede ${reference}, e esta é a parada ${refusal.requestedSequence}. Fale com o escritório para registrar fora da ordem.`
}
