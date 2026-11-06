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
  describeStopCard,
  describeStopShort,
  formatBotClock,
  stripLeadingZeros,
  type StopCard,
  type StopCardEta,
} from './whatsapp-stop-card.policy.js'

export const JOURNEY_TEXT = {
  choiceNotUnderstood: 'responda com o número da opção',
  nextArrive: '➡️ _Próximo passo:_ quando chegar, mande *cheguei*.',
  nextDepart: '➡️ _Próximo passo:_ quando for sair, mande *saí*.',
  nextSettle: '➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.',
  nothingRecorded: 'Certo, não registrei nada.',
  question: '*O que você quer fazer agora?*',
  sendCanhoto: (documentNumber: string) =>
    `📸 *Mande a foto do canhoto da NF ${stripLeadingZeros(documentNumber)}* aqui.\n_Se não entregou, mande_ *não entreguei*.`,
} as const

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
      readonly stopId: string
    }
  | {
      readonly documentNumber?: string
      readonly kind: typeof JOURNEY_ACTION.depart
      readonly stopId: string
    }
  | { readonly kind: typeof JOURNEY_ACTION.departAnyway }
  | { readonly kind: typeof JOURNEY_ACTION.chooseDeparture }
  | { readonly kind: typeof JOURNEY_ACTION.none }

const ACTION_LABEL: Readonly<Record<JourneyAction['kind'], string>> = {
  arrive: 'Cheguei',
  choose_departure: 'Escolher outra da lista',
  deliver: 'Entreguei _(mande a foto do canhoto)_',
  depart: 'Seguir para ela 🚚',
  depart_anyway: 'Sair para outra parada sem dar a baixa',
  none: 'Nada por enquanto',
  occurrence: 'Abrir ocorrência',
  return: 'Não entreguei',
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

/** "*1* - Cheguei" … as opções numeradas. */
export function describeJourneyOptions(actions: readonly JourneyAction[]): string[] {
  return actions.map((action, index) => `*${index + 1}* - ${ACTION_LABEL[action.kind]}`)
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

const etaOf = (view: StopCardView, now: Date) =>
  view.eta === undefined ? undefined : { now, value: view.eta }

/** A saída registrada: o bloco da parada (com a estrada, se houver ponto) e o próximo passo. */
export function describeDepartureDetails(view: StopCardView, now: Date): string[] {
  return [
    ...describeStopCard(view.card, { eta: etaOf(view, now), warnsUnreliableAddress: true }),
    JOURNEY_TEXT.nextArrive,
  ]
}

/** A chegada registrada: o bloco, o próximo passo e a prévia da próxima parada (sem pergunta). */
export function describeArrivalDetails(view: StopCardView): string[] {
  return [
    ...describeStopCard(view.card, { volumesSuffix: ' para entregar' }),
    JOURNEY_TEXT.nextSettle,
    ...(view.next === undefined ? [] : [`🔜 _Depois desta:_ ${describeStopShort(view.next)}`]),
  ]
}

/** O menu: o bloco da parada, a pergunta e as opções. */
function describeMenu(
  headline: string,
  view: StopCardView,
  actions: readonly JourneyAction[],
  now: Date,
): string {
  return [
    headline,
    ...describeStopCard(view.card, { eta: etaOf(view, now) }),
    '',
    JOURNEY_TEXT.question,
    ...describeJourneyOptions(actions),
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
    { documentNumber, kind: JOURNEY_ACTION.arrive, stopId: card.stopId },
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
    { documentNumber: firstNumber(card), kind: JOURNEY_ACTION.depart, stopId: card.stopId },
    { kind: JOURNEY_ACTION.chooseDeparture },
    { kind: JOURNEY_ACTION.none },
  ]
}

export function describeAlreadyArrived(
  view: StopCardView,
  input: { readonly arrivedAt: string; readonly now: Date },
): string {
  return describeMenu(
    `⚠️ *A chegada nesta parada já foi registrada*${atClock(input.arrivedAt)}.`,
    view,
    arrivedStopActions(view.card),
    input.now,
  )
}

export function describeAlreadyDeparted(
  view: StopCardView,
  input: { readonly departedAt: string; readonly now: Date },
): string {
  return describeMenu(
    `⚠️ *A saída para esta parada já foi registrada*${atClock(input.departedAt)}.`,
    view,
    enRouteStopActions(view.card),
    input.now,
  )
}

export function describePendingSettlement(
  view: StopCardView,
  input: { readonly arrivedAt: string; readonly now: Date },
): string {
  return describeMenu(
    `⚠️ *Falta a baixa desta parada.* Você chegou${atClock(input.arrivedAt)} e ainda não registrou a entrega.`,
    view,
    pendingSettlementActions(view.card),
    input.now,
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
    ? `⚠️ *A NF ${number} já foi baixada como não entregue*${when}.`
    : `⚠️ *A entrega da NF ${number} já foi registrada*${when}.`
}

/** A oferta da próxima rota: o bloco da próxima parada e a pergunta (ou só o próximo passo). */
export function describeNextRouteOffer(
  view: StopCardView,
  input: { readonly asks: boolean; readonly now: Date },
): string {
  return [
    '➡️ *Próxima parada*',
    ...describeStopCard(view.card, { eta: etaOf(view, input.now), warnsUnreliableAddress: true }),
    '',
    ...(input.asks
      ? [JOURNEY_TEXT.question, ...describeJourneyOptions(nextRouteActions(view.card))]
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
    const { documentNumber, kind, stopId } = entry as Record<string, unknown>
    switch (kind) {
      case JOURNEY_ACTION.deliver:
      case JOURNEY_ACTION.return:
      case JOURNEY_ACTION.occurrence:
        return isText(documentNumber) ? [{ documentNumber, kind }] : []
      case JOURNEY_ACTION.arrive:
      case JOURNEY_ACTION.depart:
        return isText(stopId)
          ? [{ ...(isText(documentNumber) ? { documentNumber } : {}), kind, stopId }]
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

/** O menu repetido quando a resposta não casa com nenhuma opção. */
export function describeJourneyQuestion(actions: readonly JourneyAction[]): string {
  return [JOURNEY_TEXT.question, ...describeJourneyOptions(actions)].join('\n')
}

const CLOSED_DOCUMENT = new Set(['delivered', 'returned'])

/** O bloco mínimo da parada quando não há leitor: notas em aberto e cliente, do que a lista de paradas já traz. */
export function cardFromStopCandidate(stop: WhatsAppStopCandidate): StopCard {
  const open = stop.documents.filter((document) => !CLOSED_DOCUMENT.has(document.separationStatus))
  const shown = open.length > 0 ? open : stop.documents
  return {
    address: '',
    city: '',
    contractorName: '',
    coordinate: null,
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
