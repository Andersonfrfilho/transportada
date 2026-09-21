/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
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
  TRIP_DOCUMENT_ALREADY_CLOSED: 'The document was already delivered or returned.',
  TRIP_DOCUMENT_NOT_LOADED: 'Only a loaded document can be delivered or returned.',
  TRIP_DOCUMENT_NOT_SEPARATED: 'Only a separated document can be loaded.',
  TRIP_HAS_NO_ROUTE: 'The trip has no planned route.',
  TRIP_NOT_DISPATCHED: 'Delivering and returning happen on the road, after the trip is dispatched.',
  TRIP_ROUTE_NOT_PLANNED: 'The route must be planned before the warehouse separates the cargo.',
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
 * ADR-0067 §5 (emenda 2026-09-18): a configuração da empresa exige foto e o escritório não a
 * mandou. Aplicado só ao canal `office` nesta T6 — o motorista ainda não tem esta verificação no
 * backend (pendência registrada fora da spec 156).
 */
export class TripDeliveryProofPhotoRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DELIVERY_PROOF_PHOTO_REQUIRED',
      message: 'This company requires a photo of the delivery receipt.',
      status: 422,
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
