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
import { DRIVER_TRANSITION_BLOCK_MESSAGES } from '../domain/whatsapp-driver-flow.constant.js'
import type { BotSpeechLine } from './whatsapp-bot-speech.service.js'
import {
  WHATSAPP_DRIVER_EVENT,
  type OccurrenceRequirementField,
  type WhatsAppDriverEvent,
  type WhatsAppDriverEventRefusal,
  type WhatsAppDriverEventResult,
} from './whatsapp-driver-events.service.js'

export type WhatsAppDriverEventAudience =
  | { readonly documentNumber?: string; readonly kind: 'driver' }
  /** `documentNumber` é o número da NF (o único dado da nota que aparece no grupo). */
  | { readonly documentNumber?: string; readonly kind: 'group' }

const USE_THE_APP = 'Registre pelo aplicativo.'

/** Spec 270 (R3): a frase dos dois canais quando o servidor recusa o tipo pela contratante. */
export const OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE =
  'Este tipo não vale para a contratante desta nota. Escolha outro tipo.'

/**
 * Spec 246 (RF13): o campo que o tipo exige e o WhatsApp ainda não colhe. A T15 da 293 passa a colher
 * foto, número e valor; até lá a frase manda para o app.
 */
export const OCCURRENCE_REQUIREMENT_MESSAGES: Readonly<Record<OccurrenceRequirementField, string>> =
  {
    contractor_scope: OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE,
    declared_amount: `Essa ocorrência exige o valor pago e as quantidades, e o WhatsApp não os envia. ${USE_THE_APP}`,
    items: `Essa ocorrência exige apontar os produtos da nota, e o WhatsApp não aponta produtos. ${USE_THE_APP}`,
    note: 'Essa ocorrência exige a observação. Digite o que aconteceu.',
    photo: `Essa ocorrência exige foto, e o WhatsApp não envia foto. ${USE_THE_APP}`,
    reference_number: `Essa ocorrência exige o número do documento do cliente, e o WhatsApp não o envia. ${USE_THE_APP}`,
    signature: `Essa ocorrência exige a assinatura de quem recebeu, e o WhatsApp não envia assinatura. ${USE_THE_APP}`,
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
  return together === undefined ? line : { ...line, after: [together] }
}

function describeMainLine(
  result: WhatsAppDriverEventResult,
  audience: WhatsAppDriverEventAudience,
): BotSpeechLine {
  if (result.kind === 'refused') return describeWhatsAppDriverEventRefusal(result.refusal, audience)
  const documentNumber = audience.kind === 'group' ? audience.documentNumber : undefined
  // Saí/cheguei não citam nota; sem número da nota, o grupo ouve a frase do motorista (sem dado).
  if (documentNumber === undefined || STOP_EVENTS.has(result.event)) {
    return result.kind === 'already_registered'
      ? { key: 'alreadyRegistered' }
      : { key: DRIVER_REGISTERED[result.event] }
  }
  const params = { documentNumber }
  if (result.kind === 'already_registered') return { key: 'groupAlreadyRegistered', params }
  if (result.event === WHATSAPP_DRIVER_EVENT.deliver) {
    if (result.details?.tripCompleted === true) {
      return { key: 'groupDeliveryTripCompleted', params }
    }
    if (result.details?.stopCompleted === true) {
      return { key: 'groupDeliveryStopCompleted', params }
    }
    return { key: 'groupDeliveryRegistered', params }
  }
  if (result.event === WHATSAPP_DRIVER_EVENT.return) return { key: 'groupReturnRegistered', params }
  return { key: 'groupOccurrenceRegistered', params }
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
