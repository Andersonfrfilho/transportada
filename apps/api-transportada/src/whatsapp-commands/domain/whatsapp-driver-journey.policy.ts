/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * **A jornada do motorista pelo bot**, igual no grupo e na conversa individual: o que cada passo responde
 * (o que ficou registrado, o bloco da parada e o próximo passo) e o menu numerado das ações que cabem no
 * estado da parada quando o motorista repete um evento já registrado (saí, cheguei, entreguei) ou quer sair
 * com a baixa da parada pendente. Nunca beco sem saída: toda resposta diz o próximo passo.
 *
 * O menu mora no passo aberto do pedido (grupo, `journey.actions`) ou no pedido tipado da conversa
 * (`driverPrompt` de tipo `journey_actions`): só ids e números de nota, nunca nome nem endereço.
 */
import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import { normalizeDriverCommandText } from './whatsapp-driver-command.policy.js'
import type { RouteOfferStop } from './whatsapp-driver-route-offer.policy.js'
import {
  formatNextStep,
  formatNotUnderstood,
  formatOptions,
  NOTHING_RECORDED_TEXT,
  type MessageOption,
} from './whatsapp-message-format.policy.js'
import {
  formatBotClock,
  plainText,
  STOP_CARD_TEXT,
  stripLeadingZeros,
  type StopCard,
  type StopCardEta,
} from './whatsapp-stop-card.policy.js'
import { describeStopBlock, describeStopDetails } from './whatsapp-stop-block.policy.js'
import { formatPlaceName } from './whatsapp-stop-place.policy.js'

const NOTHING_RECORDED_AGAIN_TEXT = 'Nada foi gravado de novo.'

export const JOURNEY_TEXT = {
  /** Termina em ":" — as opções vêm em seguida (o motivo do "não entendi" de menu). */
  choiceNotUnderstood: 'Responda com o número da opção:',
  nextArrive: formatNextStep('quando chegar, mande *cheguei*.'),
  nextDepart: formatNextStep('quando for sair, mande *saí*.'),
  nextSettle: formatNextStep('depois da entrega, mande a *foto do canhoto*, ou *não entreguei*.'),
  /** Parada com mais de uma nota: o canhoto é por nota, então são fotos separadas (a mesma foto não vale para duas NFs). */
  nextSettleMany: formatNextStep(
    'depois da entrega, mande uma *foto do canhoto de cada nota*, ou *não entreguei*.',
  ),
  nothingRecorded: NOTHING_RECORDED_TEXT,
  question: '*O que você quer fazer agora?*',
  sendCanhoto: (documentNumber: string) =>
    `📸 *Mande a foto do canhoto da NF ${stripLeadingZeros(documentNumber)}* aqui.\n_Se não entregou, mande_ *não entreguei*.`,
} as const

/** O primeiro nome do motorista como se lê ("ANDERSON MOTORISTA" → "Anderson"); vazio quando não há nome legível. */
function firstNameOf(fullName: string | undefined): string {
  const [first = ''] = plainText(fullName ?? '').split(' ')
  return formatPlaceName(first) ?? ''
}

export type RouteCompletedParams = {
  /** O nome do motorista da viagem; sem nome, sem a despedida (RF12). */
  readonly driverName?: string | undefined
  /** Quantas paradas a viagem tinha; desconhecido, a frase não diz o número. */
  readonly totalStops?: number | undefined
}

/** RF12: "🏁 *Rota concluída!* Todas as N paradas estão fechadas." e, com o nome, "Bom descanso, Nome. 🌙". */
export function describeRouteCompleted(params: RouteCompletedParams = {}): string {
  const { totalStops } = params
  const stops =
    totalStops === undefined || totalStops < 2 ? 'as paradas' : `as ${totalStops} paradas`
  const firstName = firstNameOf(params.driverName)
  return [
    `🏁 *Rota concluída!* Todas ${stops} estão fechadas.`,
    ...(firstName === '' ? [] : [`Bom descanso, ${firstName}. 🌙`]),
  ].join('\n')
}

export const JOURNEY_ACTION = {
  arrive: 'arrive',
  chooseDeparture: 'choose_departure',
  deliver: 'deliver',
  depart: 'depart',
  departAnyway: 'depart_anyway',
  none: 'none',
  occurrence: 'occurrence',
  return: 'return',
} as const

export type JourneyAction =
  | { readonly documentNumber: string; readonly kind: typeof JOURNEY_ACTION.deliver }
  | { readonly documentNumber: string; readonly kind: typeof JOURNEY_ACTION.return }
  | { readonly documentNumber: string; readonly kind: typeof JOURNEY_ACTION.occurrence }
  | {
      readonly documentNumber?: string
      readonly kind: typeof JOURNEY_ACTION.arrive
      /** O número da parada, para o menu dizer "Cheguei na parada N"; ausente em pedido antigo. */
      readonly sequence?: number
      readonly stopId: string
    }
  | {
      readonly documentNumber?: string
      readonly kind: typeof JOURNEY_ACTION.depart
      readonly sequence?: number
      readonly stopId: string
    }
  | { readonly kind: typeof JOURNEY_ACTION.departAnyway }
  | { readonly kind: typeof JOURNEY_ACTION.chooseDeparture }
  | { readonly kind: typeof JOURNEY_ACTION.none }

/** O ícone e a ação inteira de cada opção do menu (RF1); a parada vai em negrito. */
export function describeJourneyAction(action: JourneyAction): MessageOption {
  const stop = (sequence: number | undefined) =>
    sequence === undefined ? '' : ` *parada ${sequence}*`
  switch (action.kind) {
    case 'arrive':
      return {
        action: action.sequence === undefined ? 'Cheguei' : `Cheguei na${stop(action.sequence)}`,
        icon: '📍',
      }
    case 'choose_departure':
      return { action: 'Escolher outra da lista', icon: '📋' }
    case 'deliver':
      return { action: 'Entreguei _(mande a foto do canhoto)_', icon: '✅' }
    case 'depart':
      return {
        action:
          action.sequence === undefined
            ? 'Seguir para ela'
            : `Seguir para a${stop(action.sequence)}`,
        icon: '🚚',
      }
    case 'depart_anyway':
      return { action: 'Sair para outra parada sem dar a baixa', icon: '🚚' }
    case 'none':
      return { action: 'Nada por enquanto', icon: '💤' }
    case 'occurrence':
      return { action: 'Abrir ocorrência', icon: '⚠️' }
    case 'return':
      return { action: 'Não entreguei', icon: '↩️' }
  }
}

/** As palavras que escolhem a ação pelo nome (texto ou áudio), além do número. */
const ACTION_WORDS: Readonly<Record<JourneyAction['kind'], readonly string[]>> = {
  arrive: ['cheguei', 'chegada'],
  choose_departure: ['escolher', 'lista', 'outra'],
  deliver: ['entreguei', 'entregue', 'canhoto'],
  depart: ['seguir', 'sigo', 'iniciar', 'sim', 'bora', 'vamos'],
  depart_anyway: ['sair', 'sai'],
  none: ['nada', 'agora nao', 'depois'],
  occurrence: ['ocorrencia', 'ocorrencias'],
  return: ['nao entreguei', 'nao entregue', 'devolvi'],
}

/** "*1* - 📍 Cheguei na *parada 3*" … as opções numeradas. */
export function describeJourneyOptions(actions: readonly JourneyAction[]): string {
  return formatOptions(actions.map(describeJourneyAction))
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  cinco: 5,
  dois: 2,
  duas: 2,
  quatro: 4,
  tres: 3,
  um: 1,
  uma: 1,
}
const NEUTRAL = new Set(['a', 'o', 'opcao', 'numero', 'n', 'e', 'quero', 'escolho'])

/** O número da opção ("2", "opção dois", falado); `undefined` quando o texto não é só um número. */
export function spokenOptionNumber(text: string): number | undefined {
  const words = normalizeDriverCommandText(text)
    .split(' ')
    .filter((word) => word !== '' && !NEUTRAL.has(word))
  return words.length === 1 ? NUMBER_WORDS[words[0] ?? ''] : undefined
}

/** A ação pelo número ("2", "opção dois", falado) ou pelo nome ("não entreguei"); `undefined` quando não casa. */
export function pickJourneyAction(
  actions: readonly JourneyAction[],
  text: string,
): JourneyAction | undefined {
  const normalized = normalizeDriverCommandText(text)
  const number = spokenOptionNumber(text)
  if (number !== undefined) return actions[number - 1]
  // "não entreguei" contém "entreguei": a frase mais longa vence.
  const matches = actions
    .map((action) => ({
      action,
      length: Math.max(
        0,
        ...ACTION_WORDS[action.kind]
          .filter((word) => ` ${normalized} `.includes(` ${word} `))
          .map((word) => word.length),
      ),
    }))
    .filter((match) => match.length > 0)
    .sort((left, right) => right.length - left.length)
  const [best, second] = matches
  if (best === undefined || (second !== undefined && second.length === best.length))
    return undefined
  return best.action
}

export type StopCardView = {
  readonly card: StopCard
  readonly eta?: StopCardEta | undefined
  /** A próxima pendente do roteiro depois desta (a prévia da chegada). */
  readonly next?: StopCard | undefined
}

/** O aviso de endereço sem localização certa vai depois do bloco (saída e oferta, spec 294 RF12). */
const unreliableWarning = (card: StopCard): string[] =>
  card.isAddressReliable ? [] : ['', STOP_CARD_TEXT.unreliableAddress]

/** A saída registrada: a frase, o bloco da parada (com a estrada, se houver ponto) e o próximo passo. */
export function describeDepartureReply(headline: string, view: StopCardView, now: Date): string {
  return [
    headline,
    '',
    describeStopDetails({ card: view.card, eta: view.eta, now }),
    ...unreliableWarning(view.card),
    '',
    JOURNEY_TEXT.nextArrive,
  ].join('\n')
}

/** "parada 4 · RETA ALIMENTOS LTDA – Sao Joaquim da Barra": a próxima parada numa linha (a prévia da chegada). */
function describeNextStopPreview(card: StopCard): string {
  const client = plainText(card.recipientName)
  const city = formatPlaceName(plainText(card.city))
  return `parada ${card.sequence}${client === '' ? '' : ` · ${client}`}${city === undefined ? '' : ` – ${city}`}`
}

/** A chegada registrada: a frase, o bloco em citação, a prévia da próxima parada (sem pergunta) e o próximo passo. */
/** O pedido de baixa da parada: com mais de uma nota em aberto, uma foto de canhoto por nota. */
export function settleStepText(openDocuments: number): string {
  return openDocuments > 1 ? JOURNEY_TEXT.nextSettleMany : JOURNEY_TEXT.nextSettle
}

export function describeArrivalReply(headline: string, view: StopCardView): string {
  return [
    headline,
    '',
    describeStopDetails({ card: view.card }),
    ...(view.next === undefined
      ? []
      : ['', `🔜 *Depois desta:* ${describeNextStopPreview(view.next)}`]),
    '',
    view.card.documentNumbers.length > 1 ? JOURNEY_TEXT.nextSettleMany : JOURNEY_TEXT.nextSettle,
  ].join('\n')
}

/** O menu: a frase de cima, o bloco da parada, a pergunta e as opções. */
function describeMenu(
  headline: string,
  view: StopCardView,
  actions: readonly JourneyAction[],
): string {
  return [
    headline,
    '',
    describeStopBlock({ card: view.card, detail: 'list', eta: view.eta, quote: 'right' }),
    '',
    JOURNEY_TEXT.question,
    describeJourneyOptions(actions),
  ].join('\n')
}

/** " às 14:35", ou nada quando a hora não é uma data (registro antigo, dublê). */
function atClock(iso: string): string {
  return Number.isNaN(new Date(iso).getTime()) ? '' : ` às ${formatBotClock(iso)}`
}

const firstNumber = (card: StopCard) => stripLeadingZeros(card.documentNumbers[0] ?? '')

/** As ações de uma parada que já chegou e falta a baixa (a nota é a primeira em aberto). */
export function arrivedStopActions(card: StopCard): JourneyAction[] {
  const documentNumber = firstNumber(card)
  return [
    { documentNumber, kind: JOURNEY_ACTION.deliver },
    { documentNumber, kind: JOURNEY_ACTION.return },
    { documentNumber, kind: JOURNEY_ACTION.occurrence },
    { kind: JOURNEY_ACTION.none },
  ]
}

/** As ações de uma parada a caminho. */
export function enRouteStopActions(card: StopCard): JourneyAction[] {
  const documentNumber = firstNumber(card)
  return [
    { documentNumber, kind: JOURNEY_ACTION.arrive, sequence: card.sequence, stopId: card.stopId },
    { documentNumber, kind: JOURNEY_ACTION.occurrence },
    { kind: JOURNEY_ACTION.none },
  ]
}

/** Spec 294 RF25: sair com a baixa da parada que chegou pendente — avisa e deixa escolher. */
export function pendingSettlementActions(card: StopCard): JourneyAction[] {
  const documentNumber = firstNumber(card)
  return [
    { documentNumber, kind: JOURNEY_ACTION.deliver },
    { documentNumber, kind: JOURNEY_ACTION.return },
    { kind: JOURNEY_ACTION.departAnyway },
    { kind: JOURNEY_ACTION.none },
  ]
}

/** As ações depois da baixa: seguir para a próxima ou escolher outra. */
export function nextRouteActions(card: StopCard): JourneyAction[] {
  return [
    {
      documentNumber: firstNumber(card),
      kind: JOURNEY_ACTION.depart,
      sequence: card.sequence,
      stopId: card.stopId,
    },
    { kind: JOURNEY_ACTION.chooseDeparture },
    { kind: JOURNEY_ACTION.none },
  ]
}

export function describeAlreadyArrived(
  view: StopCardView,
  input: { readonly arrivedAt: string; readonly now: Date },
): string {
  return describeMenu(
    `⚠️ *A chegada na parada ${view.card.sequence} já foi registrada*${atClock(input.arrivedAt)}.`,
    view,
    arrivedStopActions(view.card),
  )
}

/** RF9: "já a caminho" traz o bloco e o mesmo menu do "saí" repetido (294 RF28); a frase é a do `fala_stop_en_route`. */
export function describeAlreadyDeparted(view: StopCardView, headline: string): string {
  return describeMenu(headline, view, enRouteStopActions(view.card))
}

export function describePendingSettlement(
  view: StopCardView,
  input: { readonly arrivedAt: string; readonly now: Date },
): string {
  return describeMenu(
    `⚠️ *Falta a baixa da parada ${view.card.sequence}.*\nVocê chegou${atClock(input.arrivedAt)} e ainda não registrou a entrega.`,
    view,
    pendingSettlementActions(view.card),
  )
}

/** "entreguei 17234" numa nota já baixada: diz quando e oferece a próxima (ou o resto da parada). */
export function describeAlreadySettled(input: {
  readonly documentNumber: string
  readonly now: Date
  readonly returned: boolean
  readonly settledAt: string | null
}): string {
  const number = stripLeadingZeros(input.documentNumber)
  const when = input.settledAt === null ? '' : atClock(input.settledAt)
  return input.returned
    ? `⚠️ *A NF \`${number}\` já foi baixada como não entregue*${when}.\n${NOTHING_RECORDED_AGAIN_TEXT}`
    : `⚠️ *A entrega da NF \`${number}\` já foi registrada*${when}.\n${NOTHING_RECORDED_AGAIN_TEXT}`
}

/** A oferta da próxima rota: o bloco da próxima parada em citação (com a estrada, se houver ponto) e a pergunta ou o próximo passo. */
export function describeNextRouteOffer(
  view: StopCardView,
  input: { readonly asks: boolean },
): string {
  return [
    '➡️ *Próxima parada*',
    '',
    describeStopBlock({ card: view.card, detail: 'list', eta: view.eta, quote: 'right' }),
    ...unreliableWarning(view.card),
    '',
    ...(input.asks
      ? [JOURNEY_TEXT.question, describeJourneyOptions(nextRouteActions(view.card))]
      : [JOURNEY_TEXT.nextDepart]),
  ].join('\n')
}

/** O passo do pedido (grupo) que espera a escolha do menu; o roteador guarda com o prefixo `journey.`. */
export const JOURNEY_STEP = { actions: 'actions' } as const

/** O que o passo do menu guarda: só as ações (ids e números de nota). */
export type JourneyMenuState = { readonly journeyActions: readonly JourneyAction[] }

const isText = (value: unknown): value is string => typeof value === 'string'

/** O estado é jsonb persistido: confere o formato em vez de confiar nele. */
export function readJourneyActions(value: unknown): JourneyAction[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): JourneyAction[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { documentNumber, kind, sequence, stopId } = entry as Record<string, unknown>
    switch (kind) {
      case JOURNEY_ACTION.deliver:
      case JOURNEY_ACTION.return:
      case JOURNEY_ACTION.occurrence:
        return isText(documentNumber) ? [{ documentNumber, kind }] : []
      case JOURNEY_ACTION.arrive:
      case JOURNEY_ACTION.depart:
        return isText(stopId)
          ? [
              {
                ...(isText(documentNumber) ? { documentNumber } : {}),
                kind,
                ...(typeof sequence === 'number' ? { sequence } : {}),
                stopId,
              },
            ]
          : []
      case JOURNEY_ACTION.departAnyway:
      case JOURNEY_ACTION.chooseDeparture:
      case JOURNEY_ACTION.none:
        return [{ kind }]
      default:
        return []
    }
  })
}

/** O "não entendi" do menu (conversa individual): o motivo e as opções de novo. O grupo junta motivo e opções pelo pedido. */
export function describeJourneyNotUnderstood(actions: readonly JourneyAction[]): string {
  return formatNotUnderstood({
    options: actions.map(describeJourneyAction),
    reason: JOURNEY_TEXT.choiceNotUnderstood,
  })
}

const CLOSED_DOCUMENT = new Set(['delivered', 'returned'])

/** O bloco mínimo da parada quando não há leitor: notas em aberto e cliente, do que a lista de paradas já traz. */
export function cardFromStopCandidate(stop: WhatsAppStopCandidate): StopCard {
  const open = stop.documents.filter((document) => !CLOSED_DOCUMENT.has(document.separationStatus))
  const shown = open.length > 0 ? open : stop.documents
  return {
    address: '',
    city: stop.city ?? '',
    contractorName: '',
    coordinate:
      stop.coordinate === undefined
        ? null
        : {
            latitude: String(stop.coordinate.latitude),
            longitude: String(stop.coordinate.longitude),
          },
    district: stop.district,
    documentNumbers: shown.map((document) => document.number),
    isAddressReliable: stop.isAddressReliable ?? true,
    recipientName: shown[0]?.recipientName ?? '',
    sequence: stop.sequence,
    stopId: stop.id,
    totalStops: 0,
    totalValue: null,
    volumes: null,
  }
}

/** O bloco da próxima parada como a baixa da API a devolve (`DriverNextStop`), quando não há leitor. */
export function cardFromRouteOfferStop(stop: RouteOfferStop): StopCard {
  return {
    address: stop.address,
    city: '',
    contractorName: '',
    coordinate: stop.coordinate,
    documentNumbers: stop.documents.map((document) => document.number),
    isAddressReliable: stop.isAddressReliable,
    recipientName: stop.recipientName,
    sequence: stop.sequence,
    stopId: stop.id,
    totalStops: stop.totalStops,
    totalValue: null,
    volumes: null,
  }
}
