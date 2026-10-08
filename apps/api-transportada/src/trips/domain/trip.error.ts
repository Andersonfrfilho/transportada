/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { OCCURRENCE_DECLARED_AMOUNT_FIELD } from '../../shared/trip-occurrence.constant.js'
import { OCCURRENCE_CASE_TRANSITION_REFUSALS } from './occurrence-case-state.policy.js'
import { TRIP_PROOF_REPORT_MAX_DOCUMENTS, TRIP_REPORT_MAX_ROWS } from './trip-report.constant.js'
import type { TripTransitionBlock } from './trip-state.policy.js'

export class TripVehicleNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_VEHICLE_NOT_FOUND',
      message: 'The vehicle is not in the fleet of this company.',
      status: 404,
    })
  }
}

export class TripVehicleNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_VEHICLE_NOT_AVAILABLE',
      message: 'A trip travels on an active traction vehicle.',
      status: 422,
    })
  }
}

/** Feature 147 D3: a carreta só existe no cavalo — nos demais veículos o campo não se aplica. */
export class TripTrailerRequiresTractorError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TRAILER_REQUIRES_TRACTOR',
      message: 'Only a trip on a tractor unit can have a trailer.',
      status: 400,
    })
  }
}

/** Feature 147 D3: o apontado existe na empresa, mas não é uma carreta ativa. */
export class TripTrailerNotATrailerError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TRAILER_NOT_A_TRAILER',
      message: 'The trailer must be an active trailer of this company.',
      status: 400,
    })
  }
}

/**
 * T18 (revisão): a carreta não pode ser o próprio veículo tracionado — espelha o CHECK
 * `trips_trailer_not_vehicle` (`trip.schema.ts`). A apresentação nunca oferece o próprio veículo da
 * viagem na lista de carretas; este erro é a tradução de quem escrever direto na API.
 */
export class TripTrailerNotVehicleItselfError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TRAILER_NOT_VEHICLE_ITSELF',
      message: 'The trailer cannot be the trip own traction vehicle',
      status: 400,
    })
  }
}

/** Feature 147 D3: uma carreta puxa uma viagem por vez — a mesma não entra em duas abertas. */
export class TripTrailerInUseError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TRAILER_IN_USE',
      message: 'This trailer is already linked to another open trip.',
      status: 409,
    })
  }
}

/** Feature 147 D3/Q1b: "ele não pode carregar apenas com o cavalo" — o despacho barra sem carreta. */
export class TripTrailerRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TRAILER_REQUIRED',
      message: 'A tractor unit does not dispatch without a trailer.',
      status: 409,
    })
  }
}

export class TripDriverNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_NOT_FOUND',
      message: 'A driver of the crew is not registered in this company.',
      status: 404,
    })
  }
}

export class TripDriverNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_NOT_AVAILABLE',
      message: 'A driver of the crew is not active.',
      status: 422,
    })
  }
}

export class TripDriverDuplicatedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_DUPLICATED',
      message: 'The same driver cannot take two positions in the crew.',
      status: 422,
    })
  }
}

/** Spec 149 (ADR-0065): ajudante sem nenhum motorista na tripulação — a posição 1 exige condutor. */
export class TripCrewHelperWithoutDriverError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CREW_HELPER_WITHOUT_DRIVER',
      message: 'A crew with helpers must have at least one driver.',
      status: 409,
    })
  }
}

/** Spec 149 (ADR-0065): a ficha do ajudante não marcou `can_act_as_helper` — os ids vão em `details`. */
export class TripCrewHelperNotEligibleError extends ApiError {
  public constructor(driverIds: readonly string[]) {
    super({
      code: 'TRIP_CREW_HELPER_NOT_ELIGIBLE',
      details: driverIds.map((driverId) => ({ field: 'helperIds', message: driverId })),
      message: 'One or more helpers are not marked as able to help in their driver record.',
      status: 409,
    })
  }
}

/** Spec 249 D5: transferir para a tripulação que a viagem já tem não tem efeito — nada é gravado. */
export class TripCrewUnchangedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CREW_UNCHANGED',
      message: 'The requested crew is already the crew of this trip.',
      status: 409,
    })
  }
}

/**
 * Spec 235 D5: a ficha não dirige (`can_drive = false`) e foi escalada como condutor — os ids vão em
 * `details`. Não confundir com `TRIP_CREW_HELPER_CANNOT_DRIVE` (403): aquele é o ajudante já na
 * viagem tentando despachar; este é a montagem da tripulação.
 */
export class TripDriverCannotDriveError extends ApiError {
  public constructor(driverIds: readonly string[]) {
    super({
      code: 'TRIP_DRIVER_CANNOT_DRIVE',
      details: driverIds.map((driverId) => ({ field: 'driverIds', message: driverId })),
      message: 'One or more drivers of the crew are not able to drive in their driver record.',
      status: 409,
    })
  }
}

/**
 * Spec 149 (ADR-0065) / ADR-0058 §4: despachar e os dois toques que começam a viagem no PWA são
 * gestos do motorista. O ajudante vinculado à mesma viagem tem o vínculo, mas não o papel.
 */
export class TripCrewHelperCannotDriveError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CREW_HELPER_CANNOT_DRIVE',
      message: 'A helper cannot dispatch or start the trip; only the driver crew can.',
      status: 403,
    })
  }
}

export class TripNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_NOT_FOUND',
      message: 'The trip is not registered in this company.',
      status: 404,
    })
  }
}

/** Spec 158 T6: `cursor` da querystring que não decodifica no formato de `parseTripTimelineCursor`. */
export class TripTimelineCursorInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_TIMELINE_CURSOR_INVALID',
      message: 'The timeline cursor is malformed.',
      status: 400,
    })
  }
}

/** ADR-0067 §2: o escritório registra em nome de um motorista, e a viagem não tem nenhum. */
export class TripWithoutDriverError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_WITHOUT_DRIVER',
      message: 'The trip has no driver to report on behalf of.',
      status: 422,
    })
  }
}

/** ADR-0067 §2: o motorista escolhido precisa estar na tripulação desta viagem. */
export class DriverNotOnTripError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_NOT_ON_TRIP',
      message: 'The chosen driver is not part of this trip crew.',
      status: 422,
    })
  }
}

/** Spec 145 T11: planta de outra empresa responde igual à inexistente — nunca confirma que existe. */
export class TripCargoLayoutNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CARGO_LAYOUT_NOT_FOUND',
      message: 'The cargo layout is not registered in this company.',
      status: 404,
    })
  }
}

/**
 * Spec 156 T8c: o escritório encerra a viagem com nota ainda em aberto (nem entregue, nem
 * devolvida, nem liberada) sem dizer por quê. Com todas as notas fechadas, o motivo é opcional.
 */
export class TripCloseReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CLOSE_REASON_REQUIRED',
      message: 'Closing a trip with open documents requires a reason.',
      status: 422,
    })
  }
}

/** ADR-0023: encerrar é terminal — repetir o encerramento é idempotente, mas nenhum outro comando muda uma viagem fechada. */
export class TripClosedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CLOSED',
      message: 'A closed trip no longer accepts changes.',
      status: 422,
    })
  }
}

export class TripDocumentReferenceInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_REFERENCE_INVALID',
      message: 'A trip document links to exactly one nfe document or freight calculation.',
      status: 422,
    })
  }
}

export class TripDocumentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_NOT_FOUND',
      message: 'The document is not linked to this trip.',
      status: 404,
    })
  }
}

/** Spec 218 RF-B3: o `:occurrenceTypeId` da rota de exceções não existe nesta empresa. */
export class OccurrenceTypeNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NOT_FOUND',
      message: 'Occurrence type was not found',
      status: 404,
    })
  }
}

/** Nota/frete já vivo em outra viagem (spec 027 § Dúvidas) — mesmo desenho do plate-taken de fleet. */
export class TripDocumentAlreadyLinkedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_ALREADY_LINKED',
      message: 'The document is already linked to another open trip.',
      status: 409,
    })
  }
}

/** Uma vez entregue, o vínculo trava — a nota nunca mais migra para outra viagem (spec 027 § Dúvidas). */
export class TripDocumentAlreadyDeliveredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_ALREADY_DELIVERED',
      message: 'A delivered trip document cannot be unlinked.',
      status: 422,
    })
  }
}

const TRIP_TRANSITION_BLOCK_MESSAGES: Readonly<Record<TripTransitionBlock, string>> = {
  TRIP_ALREADY_DISPATCHED: 'The cargo already left: a dispatched trip no longer accepts changes.',
  TRIP_CANCELLED: 'A cancelled trip no longer accepts changes.',
  TRIP_COMPLETED: 'A completed trip no longer accepts changes.',
  TRIP_SEPARATION_STARTED:
    'The warehouse already started separating this trip: the crew can no longer be swapped.',
  TRIP_CREW_NOT_DEFINED: 'The trip has no driver or vehicle defined yet.',
  TRIP_DOCUMENT_ALREADY_CLOSED: 'The document was already delivered or returned.',
  TRIP_DOCUMENT_NOT_LOADED: 'Only a loaded document can be delivered or returned.',
  TRIP_DOCUMENT_NOT_SEPARATED: 'Only a separated document can be loaded.',
  TRIP_HAS_NO_ROUTE: 'The trip has no planned route.',
  TRIP_NOT_DISPATCHED: 'Delivering and returning happen on the road, after the trip is dispatched.',
  TRIP_ROUTE_NOT_PLANNED: 'The route must be planned before the warehouse separates the cargo.',
  /**
   * Nunca chega ao cliente sob este código: `dispatchTrip` intercepta este motivo específico e
   * lança `TripTrailerRequiredError` — a mensagem existe só para satisfazer o `Record` exaustivo.
   */
  TRIP_TRAILER_REQUIRED: 'A tractor unit does not dispatch without a trailer.',
}

/**
 * `domain-model.md#estados`: transição inválida é `409 STATE_TRANSITION_NOT_ALLOWED`. O motivo
 * específico viaja em `details`, porque "não pode" sem dizer o quê manda a pessoa adivinhar.
 */
export class TripStateTransitionNotAllowedError extends ApiError {
  public constructor(reason: TripTransitionBlock) {
    super({
      code: 'STATE_TRANSITION_NOT_ALLOWED',
      details: [{ field: 'status', message: TRIP_TRANSITION_BLOCK_MESSAGES[reason] }],
      message: TRIP_TRANSITION_BLOCK_MESSAGES[reason],
      status: 409,
    })
    this.reason = reason
  }

  public readonly reason: TripTransitionBlock
}

/** ADR-0043 §7: motivo é obrigatório em toda nota devolvida, e só nela — o check do banco reflete isso. */
export class TripDocumentReturnReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_RETURN_REASON_REQUIRED',
      message: 'Returning a document requires a reason.',
      status: 422,
    })
  }
}

/** A nota deixou de existir no estado que a leitura viu — quem chamou tenta de novo com dado fresco. */
export class TripDocumentTransitionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_TRANSITION_CONFLICT',
      message: 'The document changed concurrently; retry with fresh state.',
      status: 409,
    })
  }
}

/**
 * O roteirizador não devolveu rota (serviço fora do ar, tempo esgotado, praças indisponíveis) —
 * `planned-route.use-case.ts` grava `null` em vez de lançar (D5), então esta é a forma de a
 * transição de planejamento recusar um `route_planned` sem `planned_route` para sustentá-lo.
 */
export class TripRouteUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_ROUTE_UNAVAILABLE',
      message: 'The route planner did not return a route; the trip stays unplanned.',
      status: 422,
    })
  }
}

/** O ator da transição precisa ser membro desta empresa — mesma regra de `audit_logs`. */
export class TripActorNotAMemberError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_ACTOR_NOT_A_MEMBER',
      message: 'The acting user is not a member of this company.',
      status: 422,
    })
  }
}

/**
 * ADR-0043 §2, spec 056 P2: sair com nota pendente acontece todo dia — o que não pode é acontecer
 * sem alguém assinar. Os ids viajam em `details` para a tela listar as notas, não só o motivo.
 */
export class TripHasUnloadedDocumentsError extends ApiError {
  public constructor(documentIds: readonly string[]) {
    super({
      code: 'TRIP_HAS_UNLOADED_DOCUMENTS',
      details: documentIds.map((documentId) => ({
        field: 'documentId',
        message: documentId,
      })),
      message: 'The trip has documents that were never loaded. Confirm with force and a reason.',
      status: 409,
    })
    this.documentIds = documentIds
  }

  public readonly documentIds: readonly string[]
}

/**
 * Spec 060 D3: o cliente que exige agendamento recusa a carga na portaria, e o caminhão volta cheio.
 * A recusa lista **as paradas**, não as notas: quem resolve isso liga para o cliente daquela parada.
 *
 * Aceita o mesmo `force` + motivo do despacho com nota pendente — "vou tentar assim mesmo" é uma
 * decisão real da operação; o que não pode é ela acontecer sem alguém assinar.
 */
export class TripHasUnscheduledStopsError extends ApiError {
  public constructor(stopIds: readonly string[]) {
    super({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      details: stopIds.map((stopId) => ({ field: 'stopId', message: stopId })),
      message: 'The trip has stops without a valid schedule. Confirm with force and a reason.',
      status: 409,
    })
    this.stopIds = stopIds
  }

  public readonly stopIds: readonly string[]
}

/**
 * Spec 185 (RF4, ADR-0074 §3): `force` libera o que falta e `loadRemaining` carrega o que falta —
 * respostas opostas à mesma pergunta. Juntas, escolher uma em silêncio faria o que ninguém pediu.
 */
export class TripDispatchLoadRemainingWithForceError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DISPATCH_LOAD_REMAINING_WITH_FORCE',
      message: 'Dispatch either loads the remaining documents or forces them out, never both.',
      status: 400,
    })
  }
}

/** Espelha `trip_dispatch_snapshots_force_reason_check`: forçado exige motivo, e só ele. */
export class TripDispatchForceReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DISPATCH_FORCE_REASON_REQUIRED',
      message: 'Dispatching with unloaded documents requires a reason.',
      status: 422,
    })
  }
}

/**
 * `PATCH /trips/:id/stops/order` exige a lista completa — nem uma parada a mais (id de outra
 * viagem, id inventado), nem uma a menos (perderia a parada silenciosamente da sequência).
 */
export class TripStopSetMismatchError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_STOP_SET_MISMATCH',
      message: 'The stop order must include every stop of the trip, and no other.',
      status: 422,
    })
  }
}

/**
 * ADR-0045 §5: a mesma chave em ações diferentes é **erro do cliente**, não repetição. Aceitar em
 * silêncio faria uma entrega ser "confirmada" pela chave de uma chegada, e o aparelho nunca saberia.
 */
export class TripFieldReportKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_FIELD_REPORT_KEY_REUSED',
      message: 'This idempotency key was already used for a different field report.',
      status: 409,
    })
  }
}

/** A parada não é desta viagem, ou a viagem não é deste motorista. As duas coisas são a mesma daqui. */
export class TripStopNotReachableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_STOP_NOT_REACHABLE',
      message: 'The stop does not belong to an active trip of this driver.',
      status: 404,
    })
  }
}

/**
 * Spec 206 D4 (ADR-0088 §2): o invariante é da viagem, não da parada — uma parada a caminho por
 * vez. Nada é gravado, e a chave de idempotência não é liquidada (a transação aborta), então o
 * mesmo item pode ser reenviado depois de a parada aberta fechar.
 */
export class TripHasStopEnRouteError extends ApiError {
  public constructor(params: {
    readonly enRouteStopId: string
    readonly enRouteStopSequence: string
  }) {
    super({
      code: 'TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: params.enRouteStopId },
        { field: 'enRouteStopSequence', message: params.enRouteStopSequence },
      ],
      message: 'Another stop of this trip is already en route.',
      status: 409,
    })
    this.enRouteStopId = params.enRouteStopId
    this.enRouteStopSequence = params.enRouteStopSequence
  }

  public readonly enRouteStopId: string
  public readonly enRouteStopSequence: string
}

/**
 * Spec 206 D18 (ADR-0088 §2b): depois do Cheguei o caminho é entregar ou "Registrar entrega
 * depois" — cancelar a saída não é mais oferecido. Grafia `cancellable`, a do repositório
 * (`trip.error.ts:181` usa `cancelled`).
 */
export class TripStopDepartureNotCancellableError extends ApiError {
  public constructor(reason: 'arrived' | 'completed') {
    super({
      code: 'TRIP_STOP_DEPARTURE_NOT_CANCELLABLE',
      details: [{ field: 'reason', message: reason }],
      message: 'The stop already arrived or completed; its departure cannot be cancelled.',
      status: 409,
    })
    this.reason = reason
  }

  public readonly reason: 'arrived' | 'completed'
}

const UNREACHABLE_DOCUMENTS_FIELD = 'documentIds'

/**
 * Confirmação enfileirada de uma nota que o escritório desvinculou. O código é estável porque a tela
 * mostra o conflito — sumir com o toque do motorista é pior do que recusá-lo com o motivo.
 */
export class TripDocumentNotReachableError extends ApiError {
  /**
   * Spec 156 T7.3: o lote do escritório diz **todas** as notas inalcançáveis de uma vez — ids
   * opacos, sem dado de negócio. Sem lista, é o erro de uma nota só, como sempre foi.
   */
  public constructor(params: { readonly unreachableDocumentIds?: readonly string[] } = {}) {
    super({
      code: 'TRIP_DOCUMENT_NOT_REACHABLE',
      ...(params.unreachableDocumentIds === undefined
        ? {}
        : {
            details: params.unreachableDocumentIds.map((documentId) => ({
              field: UNREACHABLE_DOCUMENTS_FIELD,
              message: documentId,
            })),
          }),
      message: 'The document is no longer part of an active trip of this driver.',
      status: 409,
    })
  }
}

/**
 * Spec 156 T7.3 (L4): o escritório registra ocorrência **em nome do motorista**, e o motorista só
 * registra ocorrência de rua. Tipo de galpão, aposentado ou de outra empresa respondem igual — quem
 * pergunta é a própria empresa, e a tela precisa dizer o motivo.
 */
export class OccurrenceTypeNotFieldError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NOT_FIELD',
      message: 'The occurrence type is not an active delivery occurrence type.',
      status: 422,
    })
  }
}

/**
 * Spec 218 D2: a ocorrência de parada escolheu um tipo que não é de parada ativo desta empresa —
 * tipo de nota, aposentado, ou de outra empresa respondem igual.
 */
export class OccurrenceTypeNotStopError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NOT_STOP',
      message: 'The occurrence type is not an active stop occurrence type.',
      status: 422,
    })
  }
}

/**
 * Spec 157 RF4: a rota do galpão (`trip.manage`) grava só tipo de separação. Com tipo de rua, o
 * `separator` — que tem `trip.manage` e não tem `trip.report` — registraria o que nunca viu.
 */
export class OccurrenceTypeNotSeparationError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NOT_SEPARATION',
      message: 'The occurrence type is not a separation occurrence type.',
      status: 422,
    })
  }
}

/** Spec 166 (RF8/CA08): tipo com `allowsMultipleItems` desligado aceita só um item marcado. */
export class OccurrenceTypeSingleItemError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_SINGLE_ITEM',
      message: 'This occurrence type accepts a single item.',
      status: 422,
    })
  }
}

/** Spec 241 (RF6, CA03): tipo com Produtos desligado (`itemsMode = 'off'`) não aceita produto. */
export class OccurrenceTypeItemsNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED',
      message: 'This occurrence type does not carry items.',
      status: 422,
    })
  }
}

/** Spec 241 (RF11, CA09): tipo sem produto não abre tratativa — `off` pede política `unset`. */
export class OccurrenceTypeItemsOffRedeliveryPolicyError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY',
      message: 'An occurrence type without items cannot decide redelivery.',
      status: 422,
    })
  }
}

/** O nome é único por empresa em qualquer etapa, inclusive entre os tipos de recebimento que o painel não lista. */
export class OccurrenceTypeNameTakenError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NAME_TAKEN',
      details: [{ field: 'name', message: 'An occurrence type with this name already exists' }],
      message: 'An occurrence type with this name already exists',
      status: 409,
    })
  }
}

/**
 * Spec 246 (RF1c2): a quantidade mínima de produtos só existe com Produtos obrigatório — com outro
 * modo ela seria dado morto que um `PUT` futuro religaria sem ninguém ver.
 */
export class OccurrenceTypeItemsMinimumRequiresRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_ITEMS_MINIMUM_REQUIRES_REQUIRED',
      message: 'The items minimum count only applies when items are required.',
      status: 422,
    })
  }
}

/**
 * Spec 247 (RF1): valor pago digitado por item exige produtos no tipo — sem linha não há onde
 * digitar. Pela ocorrência, ou com o valor pago desligado, `items_mode = 'off'` continua valendo.
 */
export class OccurrenceTypeDeclaredAmountNeedsItemsError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS',
      message: 'A declared amount per item requires the occurrence type to carry items.',
      status: 422,
    })
  }
}

/**
 * A conta autenticada tem o papel, mas nenhum cadastro de motorista aponta para ela. É configuração
 * pendente do escritório, não falha do motorista — e o código é estável para a tela dizer isso em
 * vez de "nada para hoje", que esconderia o problema até alguém reclamar.
 */
export class DriverNotRegisteredError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_NOT_REGISTERED',
      message: 'This account is not linked to a driver record in this company.',
      status: 409,
    })
  }
}

/**
 * ADR-0058: a rota do motorista só alcança viagem do próprio vínculo. O 403 não distingue viagem
 * inexistente de viagem alheia — distinguir seria enumerar viagens por id.
 */
export class TripNotOfDriverError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_NOT_OF_DRIVER',
      message: 'The trip does not belong to this driver.',
      status: 403,
    })
  }
}

/**
 * ADR-0057 §3: documento enviado com a configuração em `off` não entra — aceitar seria colher dado
 * pessoal que a empresa decidiu não colher.
 */
export class TripDeliveryProofDocumentNotAcceptedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DELIVERY_PROOF_DOCUMENT_NOT_ACCEPTED',
      message: 'This company does not collect the receiver document.',
      status: 422,
    })
  }
}

/** ADR-0057 §1: com o campo em `required`, assinatura sem documento não confirma. */
export class TripDeliveryProofDocumentRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DELIVERY_PROOF_DOCUMENT_REQUIRED',
      message: 'This company requires the receiver document on the signature.',
      status: 422,
    })
  }
}

/** Falha do chaveiro ao selar o documento: indisponibilidade nossa, nunca culpa do arquivo. */
export class TripDeliveryProofDocumentUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DELIVERY_PROOF_DOCUMENT_UNAVAILABLE',
      message: 'The receiver document could not be sealed. Try again.',
      status: 503,
    })
  }
}

const DELIVERY_PROOF_REJECTION_MESSAGES = {
  TOO_LARGE: 'The delivery proof is larger than the accepted size.',
  UNSUPPORTED_TYPE: 'The delivery proof must be an image.',
} as const

export type DeliveryProofRejection = keyof typeof DELIVERY_PROOF_REJECTION_MESSAGES

/**
 * ADR-0045 §7: o anexo recusado **não desfaz a entrega**. O código é estável para a tela dizer o que
 * houve com o arquivo, e a nota continua entregue — perder a confirmação por causa do aparelho seria
 * punir o motorista pelo celular que a empresa não comprou.
 */
export class TripDeliveryProofRejectedError extends ApiError {
  public constructor(rejection: DeliveryProofRejection) {
    super({
      code: `TRIP_DELIVERY_PROOF_${rejection}`,
      message: DELIVERY_PROOF_REJECTION_MESSAGES[rejection],
      status: 422,
    })
  }
}

/**
 * Spec 065 D4bis: não há CT-e a emitir nesta viagem. Ou já foram todos, ou as entregas são todas no
 * município da transportadora — e aí o documento é NFS-e, que não sai por lote de CT-e.
 *
 * Um lote vazio nasceria, seria submetido e voltaria sem nada; recusar com nome é o que diz ao
 * operador qual dos dois casos é o dele.
 */
/**
 * A nota escolhida não está pendente de CT-e — já autorizada, já num lote, ou de NFS-e. Recusar
 * nomeando cada uma é o que impede o lote de nascer silenciosamente menor do que a tela ofereceu.
 */
export class TripCteBatchDocumentNotPendingError extends ApiError {
  public constructor(tripDocumentIds: readonly string[]) {
    super({
      code: 'TRIP_CTE_BATCH_DOCUMENT_NOT_PENDING',
      details: tripDocumentIds.map((tripDocumentId) => ({
        field: tripDocumentId,
        message: 'This invoice is not waiting for a CT-e.',
      })),
      message: 'One or more selected invoices are not waiting for a CT-e.',
      status: 422,
    })
  }
}

export class TripCteBatchEmptyError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CTE_BATCH_EMPTY',
      message: 'This trip has no invoice waiting for a CT-e.',
      status: 422,
    })
  }
}

/**
 * A chave enviada não tem template ativo de canal e-mail para a empresa — o cadastro do tipo só
 * seleciona o que o módulo de notificações já publicou.
 */
export class OccurrenceEmailTemplateNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_EMAIL_TEMPLATE_NOT_FOUND',
      message: 'There is no active email template with this key for the company.',
      status: 422,
    })
  }
}

/**
 * Spec 185 (RF6, ADR-0074 §4): "a viagem segue sem a nota" só faz sentido para tipo de separação —
 * é o galpão que decide não esperar a nota, na hora de fechar a carga. Um tipo de entrega com a
 * marca ligada não teria onde ser lido (a conta de despacho só olha ocorrência de separação).
 */
export class OccurrenceTypeLeavesDocumentBehindRequiresSeparationError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_LEAVES_BEHIND_REQUIRES_SEPARATION',
      message: 'Only separation-stage occurrence types can leave the document behind.',
      status: 422,
    })
  }
}

/**
 * ADR-0067 §2 (emenda): no canal `office`, nota já `delivered`/`returned` não gera evento novo — o
 * caso real ("a entrega já aconteceu e falta o canhoto") é `field-proof`, que anexa ao evento
 * existente. O canal do motorista não passa por aqui: continua com o no-op idempotente de hoje.
 */
export class TripDocumentAlreadySettledError extends ApiError {
  public constructor() {
    super({
      code: 'DOCUMENT_ALREADY_SETTLED',
      message: 'This document was already settled by another field report.',
      status: 409,
    })
  }
}

/** ADR-0067 §3: "Entregue em"/"Devolvido em" não aceita hora no futuro (tolerância de relógio de 2min). */
export class DeliveredAtInFutureError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERED_AT_IN_FUTURE',
      message: 'The informed time is in the future.',
      status: 400,
    })
  }
}

/** ADR-0067 §3: a hora informada não pode ser anterior ao despacho congelado da viagem. */
export class DeliveredAtBeforeDispatchError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERED_AT_BEFORE_DISPATCH',
      message: 'The informed time is before the trip was dispatched.',
      status: 400,
    })
  }
}

/**
 * Spec 161 D1/RF4: a ocorrência de galpão passou a exigir foto — a recusa é do **caso de uso**
 * (`register-trip-occurrence.use-case.ts`), antes de gravar, do storage e da auditoria, nunca da
 * rota. O motivo mora ali: a fase 4 desta spec faz o WhatsApp mandar foto pelo mesmo caso de uso, e
 * a regra na rota HTTP deixaria o outro canal passar por fora.
 */
export class OccurrencePhotoRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_PHOTO_REQUIRED',
      message: 'A photo is required to register this occurrence.',
      status: 422,
    })
  }
}

/**
 * Spec 161 T1/T6: o teto de cinco anexos por ocorrência, travado no banco por dois caminhos —
 * `trip_document_occurrence_attachments_unique_position` (`23505`) e
 * `trip_document_occurrence_attachments_position_check` (`23514`). Os dois convergem para este erro
 * no caso de uso que insere o anexo (T6/T7); cobrir só o `23505` faz a sexta foto virar 500.
 */
export class TripOccurrenceAttachmentLimitError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_ATTACHMENT_LIMIT',
      message: 'This occurrence already has the maximum number of photos.',
      status: 409,
    })
  }
}

/**
 * `productCode` e `productCodes` no mesmo registro: qual deles vale? Escolher um em silêncio
 * gravaria a ocorrência sobre um item que quem registrou não marcou, e nada no registro denunciaria
 * o engano.
 */
export class OccurrenceProductSelectionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_PRODUCT_SELECTION_CONFLICT',
      message: 'Send either productCode or productCodes, never both.',
      status: 422,
    })
  }
}

/** Item repetido na mesma ocorrência é engano de quem marcou — o unique do banco também o recusa. */
export class OccurrenceProductDuplicateError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_PRODUCT_DUPLICATE',
      message: 'The same product cannot be listed twice in one occurrence.',
      status: 422,
    })
  }
}

/**
 * ⚠️ Produto fora da nota é **recusado, nunca convertido** em "a nota inteira": apontar para um
 * item que a nota não tem é engano de quem registrou, e silenciá-lo gravaria uma ocorrência sobre
 * carga que nunca esteve ali.
 */
export class OccurrenceProductNotInDocumentError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT',
      message: 'The product is not part of this document.',
      status: 422,
    })
  }
}

/**
 * Spec 166 (RF4/CA05): as quantidades enviadas não alinham por índice com os itens marcados —
 * `400`, nunca alinhamento por adivinhação.
 */
export class OccurrenceItemQuantityLengthMismatchError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ITEM_QUANTITY_LENGTH_MISMATCH',
      message: 'productQuantities and productQuantityUnits must align with productCodes.',
      status: 400,
    })
  }
}

/** Spec 166 (RF1): quantidade sem unidade, ou o contrário, é número/escolha sem significado. */
export class OccurrenceItemQuantityUnitPairingError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING',
      message: 'An item quantity must come with its unit, and a unit with its quantity.',
      status: 400,
    })
  }
}

/** Spec 166 (RF2/CA04): zero é "não aconteceu" — isso se diz não marcando o item, nunca com zero. */
export class OccurrenceItemQuantityNotPositiveError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE',
      message: 'An item quantity must be a positive number.',
      status: 400,
    })
  }
}

/**
 * Spec 166/172: a unidade tem que ser `unit`, `box`, ou a unidade comercial *daquele item* na
 * nota — nunca cai em `unit` por padrão, e nunca aceita a unidade de outro item da mesma nota.
 */
export class OccurrenceItemQuantityUnitUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN',
      message: 'The item quantity unit must be "unit", "box", or the item’s own commercial unit.',
      status: 400,
    })
  }
}

/**
 * RF29b/RF32b: a miniatura é **cache, nunca prova**, e PDF não tem miniatura. Guardar um retrato de
 * um PDF na lista mostraria uma imagem que ninguém reconhece como o documento que ela representa —
 * e, pior, uma miniatura sobrevivendo por engano viraria a única coisa visível do anexo. Recusar
 * com código próprio diz à tela exatamente o que tirar do envio.
 */
export class OccurrencePdfThumbnailError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_PDF_HAS_NO_THUMBNAIL',
      message: 'A PDF attachment cannot carry a thumbnail.',
      status: 422,
    })
  }
}

/**
 * Spec 161 RF6: a rota de anexo adicional (`attach-occurrence-photo.use-case.ts`) resolve a
 * ocorrência pela empresa do contexto — de outra empresa, ou inexistente, respondem igual, porque
 * distinguir os dois diria a quem tenta se aquele identificador existe em algum lugar.
 */
export class TripOccurrenceNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
      message: 'The occurrence was not found for this trip.',
      status: 404,
    })
  }
}

/**
 * Spec 164 T3: a tratativa (`trip_occurrence_cases`) não existe nesta empresa — de outra empresa
 * ou inexistente respondem igual, no mesmo desenho de `TripOccurrenceNotFoundError`.
 */
export class OccurrenceCaseNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CASE_NOT_FOUND',
      message: 'The occurrence case is not registered in this company.',
      status: 404,
    })
  }
}

/**
 * Espelha `OCCURRENCE_CASE_TRANSITION_REFUSALS.transitionNotAllowed`
 * (`occurrence-case-state.policy.ts`): o estado atual da tratativa não admite a ação pedida. 409,
 * não 422 — é o mesmo motivo de `TripStateTransitionNotAllowedError`, um recado idempotente para
 * quem repetiu a chamada de rede.
 */
export class OccurrenceCaseTransitionNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: OCCURRENCE_CASE_TRANSITION_REFUSALS.transitionNotAllowed,
      message: 'The occurrence case does not accept this action from its current status.',
      status: 409,
    })
  }
}

/**
 * Spec 164 (revisão 🧠 da Fase 4): decisão **diferente** sobre uma tratativa já decidida. A máquina
 * de estados não distingue "mesma decisão" de "outra decisão" — para ela o destino já foi
 * alcançado, e o resultado é `unchanged`. Sem este erro, a segunda decisão sumia em silêncio com
 * 200: o contratante via a tela responder com sucesso e o que ficou gravado era a decisão do outro.
 * A comparação vale dentro da transação, sobre a linha travada, nunca sobre leitura anterior.
 */
export class OccurrenceCaseDecisionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CASE_DECISION_CONFLICT',
      message: 'This occurrence case was already decided with a different outcome.',
      status: 409,
    })
  }
}

/**
 * Espelha as duas recusas de reentrega da política: `redeliveryNotAllowed` (o tipo do dano não
 * admite segunda tentativa, RF16) e `redeliveryBlockedHasNoQuestion` (tratativa `blocked` sem item
 * acertado não tem pergunta a fazer ao contratante, RF7). Um código por chamada, nunca os dois.
 */
export class OccurrenceCaseRedeliveryNotAllowedError extends ApiError {
  public constructor(
    code: Extract<
      keyof typeof OCCURRENCE_CASE_TRANSITION_REFUSALS,
      'redeliveryBlockedHasNoQuestion' | 'redeliveryNotAllowed'
    > = 'redeliveryNotAllowed',
  ) {
    super({
      code: OCCURRENCE_CASE_TRANSITION_REFUSALS[code],
      message: 'The occurrence type does not allow a redelivery decision here.',
      status: 422,
    })
  }
}

/** Espelha `OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems`: fechar `goods_paid` sem nenhum item acertado é fechar sem cobrar o que foi decidido. */
export class OccurrenceCaseSettlementWithoutItemsError extends ApiError {
  public constructor() {
    super({
      code: OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems,
      message: 'Closing this decision requires at least one settled item.',
      status: 422,
    })
  }
}

/** T13: o item do acerto aponta para algo que não está entre os itens desta ocorrência. */
export class OccurrenceSettlementItemUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN',
      message: 'The settlement item is not part of this occurrence.',
      status: 422,
    })
  }
}

/** T13: valor de acerto que não é maior que zero — dinheiro é `Decimal`, nunca float, nunca negativo. */
export class OccurrenceSettlementAmountInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_SETTLEMENT_AMOUNT_INVALID',
      message: 'A settlement amount must be greater than zero.',
      status: 422,
    })
  }
}

/** T13 (RF23): `driver` sem `payerId`, ou qualquer outro tipo com `payerId` — o mesmo par que o CHECK do banco reprova. */
export class OccurrenceSettlementPayerInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_SETTLEMENT_PAYER_INVALID',
      message: 'The payer kind and payer id pair is invalid for this settlement item.',
      status: 422,
    })
  }
}

/** T18: o ressarcimento aponta um item que não está acertado para esta tratativa. */
export class OccurrenceSettlementItemNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_SETTLEMENT_ITEM_NOT_FOUND',
      message: 'The settlement item was not found for this occurrence case.',
      status: 404,
    })
  }
}

/** T18 (RF31): a transportadora não se ressarce de si mesma — `payer_kind = 'carrier'` recusa. */
export class OccurrenceSettlementNotReimbursableError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_SETTLEMENT_NOT_REIMBURSABLE',
      message: 'A settlement item paid by the carrier itself cannot be reimbursed.',
      status: 422,
    })
  }
}

/**
 * T17 (RF25, validação 🧠 da Fase 5, achado 2): `findChargeParties` devolve nulo com `return`
 * silencioso na sugestão recorrente — perder uma sugestão não pode derrubar a entrega do motorista.
 * Aqui é o oposto: o acerto é dinheiro que a tratativa já decidiu cobrar, e gravar o acerto sem
 * conseguir gravar a cobrança é o defeito mais caro desta spec. Nulo aqui desfaz a transação inteira.
 */
export class OccurrenceChargePartiesUnresolvedError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CLIENT_NOT_RESOLVED',
      message: 'The delivery client and contractor for this occurrence could not be resolved.',
      status: 422,
    })
  }
}

/**
 * Revisão final (R2): `select … for no key update` não trava a linha que ainda não existe. Duas
 * requisições concorrentes sobre a mesma ocorrência inserem as duas, e quem perde bate no índice
 * único `delivery_charges_occurrence_unique`. 409, para quem repetir a chamada de rede reler o que
 * ficou gravado — a violação crua virava 500, sem nada dizer que a cobrança já existe.
 */
export class OccurrenceChargeConcurrentWriteError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CHARGE_CONCURRENT_WRITE',
      message: 'Another request is already recording the charge for this occurrence.',
      status: 409,
    })
  }
}

/**
 * Spec 179 T201 (RF2b): objeto inexistente, de outra empresa, de outra viagem, expirado ou ainda
 * não confirmado respondem **igual** — o motorista não escolhe qual objeto anexar. Distinguir os
 * casos contaria algo sobre o cadastro de outra empresa.
 */
export class TripOccurrenceUploadNotReachableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_UPLOAD_NOT_REACHABLE',
      message: 'The upload does not belong to an active trip of this driver.',
      status: 404,
    })
  }
}

/**
 * Spec 179 T203 (RF3/CA02): o tipo marcou `attachmentMode = 'required'` e o motorista registrou sem
 * referenciar um upload confirmado. Código estável — a tela usa para dizer qual dos dois falta.
 */
export class TripOccurrenceAttachmentRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_ATTACHMENT_REQUIRED',
      message: 'This occurrence type requires an attached photo or document.',
      status: 422,
    })
  }
}

/**
 * Spec 179 T203 (RF3/CA03): o tipo marcou `attachmentMode = 'required'` e o motorista registrou sem
 * escrever o motivo. Código estável, distinto do anterior — a tela precisa dizer qual dos dois
 * falta, não só que algo falta.
 */
export class TripOccurrenceNoteRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_NOTE_REQUIRED',
      message: 'This occurrence type requires a written note.',
      status: 422,
    })
  }
}

/**
 * Spec 246 (RF8, CA06): o tipo efetivo da nota exige a assinatura de quem recusou e o registro chegou
 * sem ela. Código estável próprio — a tela diz qual dos campos falta. O WhatsApp do motorista não
 * colhe assinatura e devolve este mesmo erro (RF13).
 */
export class TripOccurrenceSignatureRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_SIGNATURE_REQUIRED',
      message: 'This occurrence type requires a signature.',
      status: 422,
    })
  }
}

/**
 * Spec 246 (revisão final, M1): o mesmo upload mandado como assinatura e como anexo. A assinatura mora
 * só em `signature_object_id` (RF9); virar também linha de anexo a contaria no mínimo de fotos, no
 * demonstrativo e no expurgo. 400, como o conflito entre os dois campos de anexo no schema.
 */
export class TripOccurrenceSignatureIsAttachmentError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_SIGNATURE_IS_ATTACHMENT',
      message: 'The signature cannot also be sent as an attachment.',
      status: 400,
    })
  }
}

/**
 * Spec 246 (RF1b, RF8): o tipo efetivo da nota exige produtos (`items_mode = 'required'`) e o registro
 * não apontou nenhum — nem a nota inteira, que numa nota sem item algum não cobre nada. Código estável
 * próprio por campo: a tela diz que faltam produtos.
 */
export class TripOccurrenceItemsRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_ITEMS_REQUIRED',
      message: 'This occurrence type requires at least one item of the document.',
      status: 422,
    })
  }
}

/**
 * Spec 246 (RF1c2, RF8): produtos obrigatórios e a seleção ficou abaixo do exigido — "todos os itens da
 * nota" (mínimo nulo) recusa a seleção parcial, e o mínimo numérico recusa o que fica abaixo dele.
 */
export class TripOccurrenceItemsMinimumNotMetError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_ITEMS_MINIMUM_NOT_MET',
      message: 'This occurrence type requires more items of the document than were selected.',
      status: 422,
    })
  }
}

/**
 * Spec 246 (RF1c, RF8): a foto é obrigatória e veio, mas abaixo de `photo_minimum_count`. Código
 * próprio, distinto de `TRIP_OCCURRENCE_ATTACHMENT_REQUIRED` (nenhuma foto): a tela diz quantas faltam.
 */
export class TripOccurrencePhotoMinimumNotMetError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_PHOTO_MINIMUM_NOT_MET',
      message: 'This occurrence type requires more photos than were attached.',
      status: 422,
    })
  }
}

/**
 * Spec 167 (RF4/RF8): a tratativa já abriu — o número já está valendo dinheiro e não muda por trás
 * da cobrança. 409, o mesmo padrão de `OccurrenceCaseTransitionNotAllowedError`.
 */
export class OccurrenceCaseAlreadyOpenError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CASE_ALREADY_OPEN',
      message:
        'This occurrence already has an open case; it can no longer be corrected or cancelled.',
      status: 409,
    })
  }
}

/** Spec 167 (RF6): cancelar uma ocorrência já cancelada é 409, nunca 204 silencioso. */
export class OccurrenceAlreadyCancelledError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ALREADY_CANCELLED',
      message: 'This occurrence was already cancelled.',
      status: 409,
    })
  }
}

/** Spec 167 (RF6): corrigir uma ocorrência cancelada é 409 — cancelada é fim de linha. */
export class OccurrenceCancelledError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CANCELLED',
      message: 'This occurrence was cancelled and can no longer be corrected.',
      status: 409,
    })
  }
}

/** Spec 167 (RF6/CA07): motivo do cancelamento vazio (ou só espaço). */
export class OccurrenceCancellationReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CANCELLATION_REASON_REQUIRED',
      message: 'A cancellation reason is required.',
      status: 400,
    })
  }
}

/** Spec 167 (RF6): teto de 500 caracteres no motivo do cancelamento. */
export class OccurrenceCancellationReasonTooLongError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CANCELLATION_REASON_TOO_LONG',
      message: 'The cancellation reason must be at most 500 characters.',
      status: 400,
    })
  }
}

/**
 * Spec 247 (casos extremos): a quantidade devolvida de um código passa da **soma** das linhas da nota
 * com esse código. `400`: o número não pode existir, como a quantidade zero da 166.
 */
export class OccurrenceItemQuantityAboveDocumentError extends ApiError {
  public constructor(field: string) {
    super({
      code: 'OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT',
      details: [{ field, message: 'The quantity is above the quantity of the document.' }],
      message: 'An item quantity cannot be above the quantity of the document.',
      status: 400,
    })
  }
}

/**
 * Spec 247 (T4.8): o valor pago da ocorrência e o de uma linha ao mesmo tempo — o registro recusa no
 * corpo (`DECLARED_AMOUNT_SELECTION_CONFLICT`); a correção, que mantém o gravado quando o campo vem
 * ausente, recusa o estado final.
 */
export class OccurrenceDeclaredAmountLevelConflictError extends ApiError {
  public constructor() {
    super({
      code: 'DECLARED_AMOUNT_SELECTION_CONFLICT',
      details: [
        {
          field: OCCURRENCE_DECLARED_AMOUNT_FIELD,
          message: 'Use the occurrence amount or the item amounts, not both.',
        },
      ],
      message: 'The paid amount is either on the occurrence or on its items, never on both.',
      status: 400,
    })
  }
}

const REQUIRED_BY_OCCURRENCE_TYPE_MESSAGE = 'Required by the occurrence type.'

/**
 * Spec 247 (RF14, CA06): o tipo **efetivo** da nota exige o número do documento do cliente e o
 * registro chegou sem ele. Código próprio, com o campo: a tela diz o que falta.
 */
export class TripOccurrenceReferenceNumberRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED',
      details: [{ field: 'referenceNumber', message: REQUIRED_BY_OCCURRENCE_TYPE_MESSAGE }],
      message: 'This occurrence type requires the customer document number.',
      status: 422,
    })
  }
}

/**
 * Spec 247 (RF14, CA06): falta o valor pago que o tipo efetivo exige — na ocorrência
 * (`declaredAmount`) ou numa linha (`items[i].declaredAmount`), conforme onde ele se digita.
 */
export class TripOccurrenceDeclaredAmountRequiredError extends ApiError {
  public constructor(field: string) {
    super({
      code: 'TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED',
      details: [{ field, message: REQUIRED_BY_OCCURRENCE_TYPE_MESSAGE }],
      message: 'This occurrence type requires the declared amount.',
      status: 422,
    })
  }
}

/** Spec 253 RF2: o relatório passa do teto de linhas — o filtro precisa ser mais estreito. */
export class TripReportTooLargeError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_REPORT_TOO_LARGE',
      message: `The report has more than ${TRIP_REPORT_MAX_ROWS} rows. Narrow the filters.`,
      status: 422,
    })
  }
}

/** Spec 253 RF11: o PDF de canhotos passa do teto de notas. */
export class TripProofReportTooLargeError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_PROOF_REPORT_TOO_LARGE',
      message: `The proof report has more than ${TRIP_PROOF_REPORT_MAX_DOCUMENTS} documents. Narrow the selection.`,
      status: 422,
    })
  }
}
