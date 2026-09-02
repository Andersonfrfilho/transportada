/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DiagnosableError } from '../../shared/diagnosable.error.js'
import { ApiError } from '../../shared/api.error.js'

/**
 * ADR-0044 §1 e §5: a matriz de estrada fora do ar **não** vira haversine. A sugestão vai a `failed`
 * com este código estável, e a tela oferece ordenar à mão — resultado ruim disfarçado de bom é pior
 * que ausência, porque o motorista desfaz duas vezes e para de olhar a sugestão.
 *
 * `503` e não `500`: o serviço existe e volta; não é defeito nosso de programação.
 */
export class RoutingMatrixUnavailableError extends ApiError {
  public constructor(context?: Readonly<Record<string, unknown>>) {
    super({
      code: 'ROUTING_MATRIX_UNAVAILABLE',
      message: 'The routing matrix service is unavailable',
      status: 503,
      ...(context === undefined ? {} : { context }),
    })
  }
}

/** A viagem já saiu: reordenar paradas depois de `dispatched` é reescrever o que já rodou. */
export class RouteSuggestionTripDispatchedError extends ApiError {
  public constructor() {
    super({
      code: 'ROUTE_SUGGESTION_TRIP_DISPATCHED',
      message: 'A dispatched trip no longer accepts a route suggestion',
      status: 409,
    })
  }
}

/**
 * A viagem mudou depois que a sugestão ficou pronta — uma nota entrou, uma parada saiu. A proposta
 * descreve uma viagem que não existe mais, e aceitá-la seria aplicar o roteiro errado com cara de
 * certo. A tela pede para gerar de novo.
 */
export class RouteSuggestionStaleError extends ApiError {
  public constructor() {
    super({
      code: 'ROUTE_SUGGESTION_STALE',
      message: 'The trip changed after this suggestion was produced',
      status: 409,
    })
  }
}

export class RouteSuggestionNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'ROUTE_SUGGESTION_NOT_FOUND',
      message: 'Route suggestion not found',
      status: 404,
    })
  }
}

/** Aceitar ou rejeitar o que ainda não ficou pronto — ou o que já foi decidido — não é decisão. */
export class RouteSuggestionNotDecidableError extends ApiError {
  public constructor() {
    super({
      code: 'ROUTE_SUGGESTION_NOT_DECIDABLE',
      message: 'Only a ready suggestion can be accepted or rejected',
      status: 409,
    })
  }
}

/**
 * Spec 058 P2: sugestão multi-veículo precisa de nota e de veículo — sem os dois não há problema a
 * resolver, e uma sugestão vazia sairia `ready` sem parada nenhuma, parecendo resposta.
 */
export class MultiVehicleSuggestionEmptyError extends ApiError {
  public constructor(field: 'documentIds' | 'vehicleIds') {
    super({
      code: 'ROUTE_SUGGESTION_POOL_EMPTY',
      details: [{ field, message: 'at least one item is required' }],
      message: 'A multi-vehicle suggestion needs documents and vehicles',
      status: 422,
    })
  }
}

/**
 * Nota que já está em viagem não entra no pool: ela já tem parada, ordem e um responsável. Deixá-la
 * entrar faria a mesma entrega ser proposta duas vezes, em duas viagens diferentes.
 */
export class MultiVehicleSuggestionDocumentUnavailableError extends ApiError {
  public constructor(documentIds: readonly string[]) {
    super({
      code: 'ROUTE_SUGGESTION_DOCUMENT_UNAVAILABLE',
      details: documentIds.map((documentId) => ({ field: 'documentIds', message: documentId })),
      message: 'One or more documents are not available for routing',
      status: 409,
    })
  }
}

/** Veículo que não é de tração não puxa carga: implemento sozinho não é uma viagem. */
export class MultiVehicleSuggestionVehicleUnavailableError extends ApiError {
  public constructor(vehicleIds: readonly string[]) {
    super({
      code: 'ROUTE_SUGGESTION_VEHICLE_UNAVAILABLE',
      details: vehicleIds.map((vehicleId) => ({ field: 'vehicleIds', message: vehicleId })),
      message: 'One or more vehicles cannot be routed',
      status: 409,
    })
  }
}

/**
 * Defeito nosso, nao do chamador. **Nao** estende `ApiError` de proposito: ela deve cair no ramo
 * de erro desconhecido, que responde 500 generico ao cliente (`security.md` 3) e registra a
 * mensagem no log do servidor. Como `ApiError`, a mensagem viajaria na resposta.
 *
 * Ela existe para que um defeito interno deixe de ser indistinguivel de uma falha de banco no
 * log -- foi essa confusao que escondeu, por uma spec inteira, uma releitura fora da transacao.
 */
export class MultiVehicleSuggestionWriteFailedError extends DiagnosableError {
  public constructor(reason: string) {
    super(`Multi vehicle suggestion write failed: ${reason}`)
    this.name = 'MultiVehicleSuggestionWriteFailedError'
  }
}
