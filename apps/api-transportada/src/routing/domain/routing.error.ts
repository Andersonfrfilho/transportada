/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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
