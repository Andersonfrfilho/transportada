/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TRIP_STATUSES,
  type TripDocumentSeparationStatus,
  type TripStatus,
} from '../../database/trip.schema.js'

/**
 * ADR-0043 §1: dois eixos. A nota anda por conta própria (`pending → separated → loaded →
 * delivered | returned`) e o estado da viagem é **derivado** disso, exceto nas quatro transições
 * manuais. Módulo puro, sem I/O — é o que torna testável toda aresta inválida sem subir banco.
 */

export const TRIP_DOCUMENT_ACTION = {
  deliver: 'deliver',
  load: 'load',
  return: 'return',
  separate: 'separate',
} as const

export type TripDocumentAction = (typeof TRIP_DOCUMENT_ACTION)[keyof typeof TRIP_DOCUMENT_ACTION]

export const TRIP_ACTION = {
  cancel: 'cancel',
  /**
   * Spec 158 T12 (PERGUNTAS-ABERTAS #28): o encerramento manual (`close`). Só existe para bloquear
   * `cancelled → completed` com o mesmo código de transição proibida das demais — `completed` já é
   * idempotente por fora, no próprio caso de uso.
   */
  close: 'close',
  /** ADR-0058: o motorista afirma que o que está no caminhão é o que esta viagem diz. */
  confirmLoad: 'confirmLoad',
  /** Spec 216: define motorista e/ou veículo pela primeira vez — só sai de `awaiting_crew`. */
  defineCrew: 'defineCrew',
  dispatch: 'dispatch',
  planRoute: 'planRoute',
  /** ADR-0058: "saí". É a informação que a derivação não tinha como ver. */
  startRoute: 'startRoute',
  /**
   * Spec 249 D1: troca motorista e ajudante de uma viagem **que já saiu**. Separada de `defineCrew`
   * de propósito — a janela da 217 (até `route_planned`) não muda, e aqui nunca há transição de
   * status: liberado é sempre `unchanged`.
   */
  transferCrew: 'transferCrew',
} as const

export type TripAction = (typeof TRIP_ACTION)[keyof typeof TRIP_ACTION]

export const TRIP_TRANSITION_BLOCK = {
  /** A carga já está na rua: nenhuma nota entra, sai ou muda de separação (ADR-0043 §2). */
  tripAlreadyDispatched: 'TRIP_ALREADY_DISPATCHED',
  tripCancelled: 'TRIP_CANCELLED',
  tripCompleted: 'TRIP_COMPLETED',
  /**
   * Entregar e devolver acontecem na rua — antes do despacho a nota ainda está no barracão. Vale
   * também para os dois toques da ADR-0058: conferir carga e iniciar trajeto são de quem já está
   * com o caminhão carregado. ⚠️ "Conferir carga" (`confirmLoad`/`TRIP_ACTION.confirmLoad`) é
   * legado desde a spec 185 (ADR-0074 §5): a rota segue aceita e idempotente para aparelho com
   * versão velha, mas `allowed-actions` não a oferece mais — a conferência é o próprio carregamento.
   */
  tripNotDispatched: 'TRIP_NOT_DISPATCHED',
  /** Separar carga cujo roteiro ninguém conferiu é separar carga que talvez não vá. */
  tripRouteNotPlanned: 'TRIP_ROUTE_NOT_PLANNED',
  /** Não existe despacho sem roteiro montado. */
  tripHasNoRoute: 'TRIP_HAS_NO_ROUTE',
  /** Spec 216: nada acontece numa viagem `awaiting_crew` além de definir a tripulação ou cancelar. */
  tripCrewNotDefined: 'TRIP_CREW_NOT_DEFINED',
  /**
   * Spec 217 D2: a porta que fecha a troca de tripulação é a **separação**, não o roteiro. O nome diz
   * o motivo real da recusa: o separador já está com papel na mão contando volume para um caminhão
   * específico, e trocar o baú debaixo dele é pior que recusar. Substituiu `TRIP_CREW_ALREADY_DEFINED`
   * da 216, que mentia sobre a causa desde que `route_planned` entrou na janela.
   */
  tripSeparationStarted: 'TRIP_SEPARATION_STARTED',
  documentNotSeparated: 'TRIP_DOCUMENT_NOT_SEPARATED',
  documentNotLoaded: 'TRIP_DOCUMENT_NOT_LOADED',
  documentAlreadyClosed: 'TRIP_DOCUMENT_ALREADY_CLOSED',
  /** Feature 147 D3: o cavalo não carrega sozinho — sem carreta, `dispatch` não sai daqui. */
  tripTrailerRequired: 'TRIP_TRAILER_REQUIRED',
} as const

export type TripTransitionBlock = (typeof TRIP_TRANSITION_BLOCK)[keyof typeof TRIP_TRANSITION_BLOCK]

/**
 * Três desfechos, não dois. `unchanged` é o que sustenta a idempotência da RF-8: a rede do armazém
 * cai e o separador toca duas vezes — repetir a mesma transição devolve 200 sem gravar evento novo,
 * nunca 409.
 */
export type TripTransition<TStatus> =
  | { readonly outcome: 'applied'; readonly nextStatus: TStatus }
  | { readonly outcome: 'unchanged' }
  | { readonly outcome: 'blocked'; readonly reason: TripTransitionBlock }

/**
 * A ordem em que a viagem anda. `cancelled` fica fora: é saída, não etapa. Spec 216: `awaiting_crew`
 * entra antes de `draft` — nada aqui assume que o índice 0 é "o estado inicial de verdade", as duas
 * únicas leitoras (`checkFieldStart`, `deriveTripStatus`) só comparam avanço relativo.
 */
const TRIP_STATUS_ORDER = [
  'awaiting_crew',
  'draft',
  'route_planned',
  'separating',
  'loading',
  'dispatched',
  'in_transit',
  'on_delivery_route',
  'completed',
] as const

const DOCUMENT_TARGET_STATUS: Readonly<Record<TripDocumentAction, TripDocumentSeparationStatus>> = {
  deliver: 'delivered',
  load: 'loaded',
  return: 'returned',
  separate: 'separated',
}

export function tripStatusRank(status: TripStatus): number {
  const rank = TRIP_STATUS_ORDER.indexOf(status as (typeof TRIP_STATUS_ORDER)[number])
  return rank === -1 ? Number.NaN : rank
}

/**
 * A carga está na rua: o roteiro congelou e o trabalho passou a ser de campo. `completed` entra
 * porque ela **esteve** na rua — quem pergunta "já saiu?" quer sim para a viagem concluída.
 *
 * ⚠️ **Esta lista é a fonte, e as consultas a importam.** Ela era rederivada em cinco repositórios
 * com recortes ligeiramente diferentes; ao acrescentar `on_delivery_route` à máquina, a viagem
 * sumia de `/me/trips/current` no instante em que o motorista tocava em iniciar trajeto — porque
 * uma das cópias não conhecia o estado novo.
 */
export const TRIP_DISPATCHED_STATUSES = [
  'dispatched',
  'in_transit',
  'on_delivery_route',
  'completed',
] as const satisfies readonly TripStatus[]

/** A rua **agora**: o mesmo recorte sem a viagem que já acabou. */
export const TRIP_ON_ROAD_STATUSES = [
  'dispatched',
  'in_transit',
  'on_delivery_route',
] as const satisfies readonly TripStatus[]

export function isTripDispatched(status: TripStatus): boolean {
  return (TRIP_DISPATCHED_STATUSES as readonly TripStatus[]).includes(status)
}

/**
 * ADR-0043 §2: vincular e desvincular nota são trabalho de barracão, como separar e carregar —
 * `dispatched` em diante é a porta de não-retorno para os dois também. `null` significa liberado.
 */
export function checkTripAcceptsLinkage(tripStatus: TripStatus): TripTransitionBlock | null {
  if (tripStatus === 'cancelled') return TRIP_TRANSITION_BLOCK.tripCancelled
  if (tripStatus === 'completed') return TRIP_TRANSITION_BLOCK.tripCompleted
  if (isTripDispatched(tripStatus)) return TRIP_TRANSITION_BLOCK.tripAlreadyDispatched

  return null
}

/**
 * Spec 257 D1: a janela do vínculo **com a carga já na rua** — ação própria, com motivo, e nunca o
 * vínculo comum afrouxado. Antes do despacho vale `checkTripAcceptsLinkage`; concluída e cancelada
 * seguem recusadas com o motivo do estado.
 */
export function checkTripAcceptsLinkageAfterDispatch(
  tripStatus: TripStatus,
): TripTransitionBlock | null {
  if (tripStatus === 'cancelled') return TRIP_TRANSITION_BLOCK.tripCancelled
  if (tripStatus === 'completed') return TRIP_TRANSITION_BLOCK.tripCompleted
  if (!isTripDispatched(tripStatus)) return TRIP_TRANSITION_BLOCK.tripNotDispatched

  return null
}

/**
 * Spec 153 T704 (M1/M3): os estados em que a rota planejada ainda é rascunho. A partir do despacho o
 * roteiro congelado é o que vale na rua, e nem a limpeza da rota velha nem uma escrita atrasada do
 * congelamento podem alcançá-lo. Lista própria: não deriva do vínculo de nota, que a spec 257 abre
 * para a viagem na rua sem abrir a rota.
 */
export const TRIP_STATUSES_BEFORE_DISPATCH = TRIP_STATUSES.filter(
  (status) => status !== 'cancelled' && status !== 'completed' && !isTripDispatched(status),
)

/** Entregue e devolvida são terminais: a nota saiu do fluxo de separação para sempre. */
export function isTripDocumentClosed(status: TripDocumentSeparationStatus): boolean {
  return status === 'delivered' || status === 'returned'
}

export type CheckTripDocumentTransitionParams = {
  readonly action: TripDocumentAction
  readonly documentStatus: TripDocumentSeparationStatus
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1 e §2. Toda aresta do eixo da nota passa por aqui, inclusive as proibidas — e o
 * estado da viagem participa da decisão porque separar e carregar são de barracão, entregar e
 * devolver são de rua.
 */
export function checkTripDocumentTransition({
  action,
  documentStatus,
  tripStatus,
}: CheckTripDocumentTransitionParams): TripTransition<TripDocumentSeparationStatus> {
  const target = DOCUMENT_TARGET_STATUS[action]

  // A ordem destes quatro portões é decisão, não acaso.
  //
  // 1. **O no-op idempotente vem antes de tudo**, inclusive do estado da viagem. "A nota já está
  //    onde você quer" é verdade independente da viagem, nunca escreve nada, e é o que torna todo
  //    replay seguro. A fila offline do motorista (spec 057 D5) drena confirmação duplicada muito
  //    depois do toque: se o portão da viagem viesse primeiro, uma entrega que **funcionou**
  //    voltaria como 409 e o PWA mostraria conflito para o motorista que fez tudo certo.
  // 2. Depois o estado da viagem, que é a restrição externa — carga que já saiu não se separa,
  //    seja qual for o estado da nota.
  // 3. Depois o terminal da nota (entregue/devolvida não voltam ao fluxo de separação).
  // 4. Por último a origem exigida pela ação.
  if (documentStatus === target) return { outcome: 'unchanged' }

  const tripBlock = checkTripAcceptsDocumentWork({ action, tripStatus })
  if (tripBlock !== null) return { outcome: 'blocked', reason: tripBlock }

  if (isTripDocumentClosed(documentStatus)) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentAlreadyClosed }
  }

  return checkDocumentOrigin({ action, documentStatus, target })
}

/**
 * Spec 144 T016: exportada para o menu do operador no WhatsApp derivar quais ações o portão aceita
 * no estado atual — nunca uma tabela paralela que possa discordar desta.
 */
export function checkTripAcceptsDocumentWork(input: {
  readonly action: TripDocumentAction
  readonly tripStatus: TripStatus
}): TripTransitionBlock | null {
  const { action, tripStatus } = input
  if (tripStatus === 'cancelled') return TRIP_TRANSITION_BLOCK.tripCancelled
  if (tripStatus === 'completed') return TRIP_TRANSITION_BLOCK.tripCompleted

  /**
   * Spec 182 RF3 (decisão do usuário em 24/09, registrada como deliberada): a baixa de entrega
   * deixa de exigir a viagem despachada — o escritório registra a partir da linha da nota mesmo
   * antes da saída, para corrigir registro ou lançar entrega feita por fora da viagem. `return`
   * continua exigindo rua: devolução é sempre um retorno físico de algo que saiu.
   */
  if (action === TRIP_DOCUMENT_ACTION.deliver) return null
  if (action === TRIP_DOCUMENT_ACTION.return) {
    return isTripDispatched(tripStatus) ? null : TRIP_TRANSITION_BLOCK.tripNotDispatched
  }

  if (isTripDispatched(tripStatus)) return TRIP_TRANSITION_BLOCK.tripAlreadyDispatched
  // Spec 216: sem tripulação, separar/carregar carga é tão prematuro quanto sem roteiro planejado.
  if (tripStatus === 'draft' || tripStatus === 'awaiting_crew') {
    return TRIP_TRANSITION_BLOCK.tripRouteNotPlanned
  }

  return null
}

function checkDocumentOrigin(input: {
  readonly action: TripDocumentAction
  readonly documentStatus: TripDocumentSeparationStatus
  readonly target: TripDocumentSeparationStatus
}): TripTransition<TripDocumentSeparationStatus> {
  const { action, documentStatus, target } = input

  if (action === TRIP_DOCUMENT_ACTION.separate) {
    return { outcome: 'applied', nextStatus: target }
  }

  if (action === TRIP_DOCUMENT_ACTION.load) {
    return documentStatus === 'separated'
      ? { outcome: 'applied', nextStatus: target }
      : { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotSeparated }
  }

  return documentStatus === 'loaded'
    ? { outcome: 'applied', nextStatus: target }
    : { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.documentNotLoaded }
}

/**
 * Spec 217 D1: a composição da tripulação que **resulta** da escrita, não a que está no banco. É o
 * par que decide o status, e por isso ela chega até aqui em vez de ser deduzida do status anterior.
 */
export type TripCrewComposition = {
  readonly hasDriver: boolean
  readonly hasVehicle: boolean
}

/**
 * Spec 217 D1: par completo é `draft`, qualquer metade é `awaiting_crew`. Uma função, duas leitoras
 * (a criação e a troca), nenhuma chance de as duas discordarem.
 */
export function resolveCrewStatus(crew: TripCrewComposition): 'awaiting_crew' | 'draft' {
  return crew.hasDriver && crew.hasVehicle ? 'draft' : 'awaiting_crew'
}

/**
 * União discriminada por `action` de propósito (spec 217 D1): `defineCrew` **exige** a composição
 * resultante. Perguntar "posso trocar a tripulação?" sem dizer qual tripulação resulta era
 * justamente como o status passava a mentir.
 */
export type CheckTripTransitionParams =
  | {
      readonly action: Exclude<TripAction, typeof TRIP_ACTION.defineCrew>
      readonly hasRoute: boolean
      /**
       * Feature 147 D3/T11: só `dispatch` lê isto — ausente é "não se aplica", e o comportamento das
       * demais ações (e do próprio dispatch antes desta feature) não muda.
       */
      readonly requiresTrailer?: boolean
      readonly tripStatus: TripStatus
    }
  | {
      readonly action: typeof TRIP_ACTION.defineCrew
      readonly crew: TripCrewComposition
      readonly hasRoute: boolean
      readonly tripStatus: TripStatus
      /**
       * Spec 217 D3: **só a troca de veículo mata a rota.** O traçado e o pedágio saem da classe e
       * dos eixos do caminhão; quem dirige não entra nessa conta (097 D1/D3/D4, com D6 decidido e não
       * implementado). Trocar só o motorista deixa a rota de pé, e é este campo que permite à
       * máquina de estados saber a diferença.
       */
      readonly vehicleChanged: boolean
    }

/**
 * As transições manuais da viagem (ADR-0043 §1). As demais são derivadas — ver
 * `deriveTripStatus`, e nunca escritas à mão. ⚠️ `dispatch` é a exceção parcial (spec 185,
 * ADR-0074): esta função não distingue quem chama — o mesmo gate serve o botão "Despachar"
 * (`dispatch-trip.use-case.ts`) e o gatilho automático (`try-auto-dispatch-trip.use-case.ts`), que
 * roda sozinho quando a carga fecha e nunca usa `force`.
 */
export function checkTripTransition(params: CheckTripTransitionParams): TripTransition<TripStatus> {
  const { action, hasRoute, tripStatus } = params
  if (action === TRIP_ACTION.cancel) return checkCancel(tripStatus)
  if (action === TRIP_ACTION.defineCrew) {
    return checkDefineCrew({
      crew: params.crew,
      hasRoute,
      tripStatus,
      vehicleChanged: params.vehicleChanged,
    })
  }
  // Spec 216: sem tripulação, só `defineCrew` e `cancel` (já resolvidos acima) têm o que fazer.
  if (action === TRIP_ACTION.transferCrew) return checkTransferCrew(tripStatus)
  if (tripStatus === 'awaiting_crew') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCrewNotDefined }
  }
  if (action === TRIP_ACTION.close) return checkClose(tripStatus)
  if (action === TRIP_ACTION.planRoute) return checkPlanRoute({ hasRoute, tripStatus })
  if (action === TRIP_ACTION.confirmLoad) return checkFieldStart(tripStatus, 'in_transit')
  if (action === TRIP_ACTION.startRoute) return checkFieldStart(tripStatus, 'on_delivery_route')

  return checkDispatch({
    hasRoute,
    tripStatus,
    ...(params.requiresTrailer === undefined ? {} : { requiresTrailer: params.requiresTrailer }),
  })
}

/**
 * Spec 217 D1/D2/D3, sucessora da porta que a 216 abriu. Três perguntas, nesta ordem:
 *
 * 1. A viagem terminou ou foi cancelada? Nada a trocar.
 * 2. O barracão já começou a separar? Recusa nomeada (D2) — o limite é o trabalho humano já
 *    investido, não o dado.
 * 3. Qual status o par resultante descreve? É `resolveCrewStatus` quem responde (D1), e o roteiro
 *    congelado só sobrevive se o veículo não mudou (D3).
 */
function checkDefineCrew(input: {
  readonly crew: TripCrewComposition
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
  readonly vehicleChanged: boolean
}): TripTransition<TripStatus> {
  const { crew, hasRoute, tripStatus, vehicleChanged } = input

  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }
  if (!isCrewSwappable(tripStatus)) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripSeparationStarted }
  }

  const nextStatus = resolveNextCrewStatus({ crew, hasRoute, vehicleChanged })

  return nextStatus === tripStatus ? { outcome: 'unchanged' } : { outcome: 'applied', nextStatus }
}

/**
 * Spec 217 D2/D6: **a janela da troca de tripulação, numa função só.** A máquina de estados a usa
 * para recusar, e `resolveTripAllowedActions` a usa para oferecer a tela — se fossem duas listas, um
 * dia a tela ofereceria um botão que o servidor recusa, ou esconderia um que ele aceita.
 *
 * `cancelled` e `completed` ficam fora por não estarem na lista, e `checkDefineCrew` os trata antes
 * para que a recusa deles diga o motivo certo em vez de "a separação começou".
 */
export function isCrewSwappable(tripStatus: TripStatus): boolean {
  return tripStatus === 'awaiting_crew' || tripStatus === 'draft' || tripStatus === 'route_planned'
}

/**
 * Spec 249 D1: a viagem na rua ou já concluída troca de tripulação; a cancelada diz o motivo próprio, e tudo
 * antes do despacho cabe à `defineCrew`. Resultado de status é sempre `unchanged`.
 */
function checkTransferCrew(tripStatus: TripStatus): TripTransition<TripStatus> {
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (!isCrewTransferable(tripStatus)) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripNotDispatched }
  }

  return { outcome: 'unchanged' }
}

/**
 * Spec 249 D1: **a janela da transferência de tripulação, numa função só** — a máquina de estados a
 * usa para liberar e `resolveTripAllowedActions` para oferecer a tela. É a rua de agora, e não se
 * sobrepõe a `isCrewSwappable`.
 */
export function isCrewTransferable(tripStatus: TripStatus): boolean {
  return (
    tripStatus === 'completed' ||
    (TRIP_ON_ROAD_STATUSES as readonly TripStatus[]).includes(tripStatus)
  )
}

/**
 * Spec 217 D3: o roteiro congelado é o que distingue `draft` de `route_planned` num par completo.
 * Ele sobrevive à troca de motorista e morre na troca de veículo — e é por isso que a viagem
 * **regride** para `draft` nesse caso: o botão "Planejar rota" tem de reaparecer.
 *
 * ⚠️ A volta também funciona: viagem que caiu para `awaiting_crew` por tripulação desfeita, com a
 * rota intacta, retorna direto para `route_planned` quando o par se completa de novo sem trocar o
 * caminhão. Nada de exigir replanejamento de uma rota que nunca deixou de valer.
 */
function resolveNextCrewStatus(input: {
  readonly crew: TripCrewComposition
  readonly hasRoute: boolean
  readonly vehicleChanged: boolean
}): TripStatus {
  if (resolveCrewStatus(input.crew) === 'awaiting_crew') return 'awaiting_crew'

  return input.hasRoute && !input.vehicleChanged ? 'route_planned' : 'draft'
}

/**
 * Spec 158 T12: encerrar é sempre rumo a `completed`, exceto a viagem cancelada — sair de
 * `cancelled` é reabrir o que o incidente já fechou, e a máquina não tem aresta para isso.
 * `completed` devolve `unchanged`: o próprio `close` já responde 200 sem gravar de novo.
 */
function checkClose(tripStatus: TripStatus): TripTransition<TripStatus> {
  if (tripStatus === 'completed') return { outcome: 'unchanged' }
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }

  return { outcome: 'applied', nextStatus: 'completed' }
}

/**
 * ADR-0058: os dois toques do campo têm o mesmo portão e a mesma tolerância. Repetir converge em
 * `unchanged` — a rede do pátio cai e o separador toca duas vezes —, e o estado nunca anda para
 * trás: iniciar o trajeto de uma viagem que já está em rota não a devolve a `in_transit`.
 *
 * Iniciar direto de `dispatched` é aceito de propósito: quem esqueceu de conferir e já está na
 * estrada não pode ficar preso atrás de um toque esquecido.
 */
function checkFieldStart(
  tripStatus: TripStatus,
  nextStatus: Extract<TripStatus, 'in_transit' | 'on_delivery_route'>,
): TripTransition<TripStatus> {
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }
  if (!isTripDispatched(tripStatus)) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripNotDispatched }
  }
  if (tripStatusRank(tripStatus) >= tripStatusRank(nextStatus)) return { outcome: 'unchanged' }

  return { outcome: 'applied', nextStatus }
}

/**
 * ADR-0043 §2: sair de `dispatched` só por cancelamento administrativo — é incidente, não fluxo,
 * e a rota exige motivo. Concluída não cancela: o que aconteceu já aconteceu.
 */
function checkCancel(tripStatus: TripStatus): TripTransition<TripStatus> {
  if (tripStatus === 'cancelled') return { outcome: 'unchanged' }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }

  return { outcome: 'applied', nextStatus: 'cancelled' }
}

function checkPlanRoute(input: {
  readonly hasRoute: boolean
  readonly tripStatus: TripStatus
}): TripTransition<TripStatus> {
  const { hasRoute, tripStatus } = input
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (isTripDispatched(tripStatus)) {
    return {
      outcome: 'blocked',
      reason:
        tripStatus === 'completed'
          ? TRIP_TRANSITION_BLOCK.tripCompleted
          : TRIP_TRANSITION_BLOCK.tripAlreadyDispatched,
    }
  }
  if (!hasRoute) return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute }
  // Separação em andamento não regride para `route_planned`: reordenar parada é outra operação,
  // e ela continua liberada até o despacho.
  if (tripStatus !== 'draft') return { outcome: 'unchanged' }

  return { outcome: 'applied', nextStatus: 'route_planned' }
}

function checkDispatch(input: {
  readonly hasRoute: boolean
  readonly requiresTrailer?: boolean
  readonly tripStatus: TripStatus
}): TripTransition<TripStatus> {
  const { hasRoute, tripStatus } = input
  if (tripStatus === 'cancelled') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCancelled }
  }
  if (tripStatus === 'completed') {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripCompleted }
  }
  if (isTripDispatched(tripStatus)) return { outcome: 'unchanged' }
  if (tripStatus === 'draft' || !hasRoute) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripHasNoRoute }
  }
  /** Feature 147 D3: o portão do roteiro vem antes — sem roteiro a carreta nem chegou a importar. */
  if (input.requiresTrailer === true) {
    return { outcome: 'blocked', reason: TRIP_TRANSITION_BLOCK.tripTrailerRequired }
  }

  return { outcome: 'applied', nextStatus: 'dispatched' }
}

export type TripDocumentTally = {
  readonly delivered: number
  readonly loaded: number
  readonly pending: number
  readonly returned: number
  readonly separated: number
}

export function tallyTripDocuments(
  statuses: readonly TripDocumentSeparationStatus[],
): TripDocumentTally {
  return {
    delivered: statuses.filter((status) => status === 'delivered').length,
    loaded: statuses.filter((status) => status === 'loaded').length,
    pending: statuses.filter((status) => status === 'pending').length,
    returned: statuses.filter((status) => status === 'returned').length,
    separated: statuses.filter((status) => status === 'separated').length,
  }
}

export type DeriveTripStatusParams = {
  readonly tally: TripDocumentTally
  readonly tripStatus: TripStatus
}

/**
 * ADR-0043 §1: o estado da viagem é consequência aritmética do estado das notas, calculada na
 * mesma transação da escrita da nota. **Só anda para a frente** — nenhuma derivação faz a viagem
 * regredir, e é isso que impede um painel de discordar do outro.
 */
export function deriveTripStatus({ tally, tripStatus }: DeriveTripStatusParams): TripStatus {
  if (tripStatus === 'cancelled' || tripStatus === 'completed') return tripStatus

  const total = tally.pending + tally.separated + tally.loaded + tally.delivered + tally.returned
  // Viagem sem nota não deriva nada — "toda nota entregue" é vacuamente verdade num saco vazio.
  if (total === 0) return tripStatus

  const candidate = resolveDerivedCandidate({ tally, total, tripStatus })

  return tripStatusRank(candidate) > tripStatusRank(tripStatus) ? candidate : tripStatus
}

function resolveDerivedCandidate(input: {
  readonly tally: TripDocumentTally
  readonly total: number
  readonly tripStatus: TripStatus
}): TripStatus {
  const { tally, total, tripStatus } = input
  const closed = tally.delivered + tally.returned

  if (isTripDispatched(tripStatus)) {
    if (closed === total) return 'completed'
    /* ADR-0058 §3: fechar uma nota adianta a viagem de quem esqueceu de tocar em iniciar trajeto. */
    if (closed > 0) return 'on_delivery_route'

    return tripStatus
  }

  if (tally.loaded > 0) return 'loading'
  if (tally.separated > 0) return 'separating'

  return tripStatus
}
