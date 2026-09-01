/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
  RouteSuggestionTripDispatchedError,
} from '../../src/routing/domain/routing.error.js'
import { createRouteSuggestionUseCase } from '../../src/routing/application/route-suggestion.use-case.js'
import {
  COMPANY_SCOPE,
  READY_RECORD,
  SUGGESTION_ID,
  TRIP_ID,
  buildDependencies,
} from '../fixtures/route-suggestion-application.fixture.js'

describe('creating a route suggestion (ADR-0044 §7)', () => {
  test('creates it queued and asks the worker to solve it', async () => {
    const dependencies = buildDependencies()
    const useCase = createRouteSuggestionUseCase(dependencies)

    const created = await useCase.create({
      context: COMPANY_SCOPE,
      correlationId: 'correlation-1',
      tripId: TRIP_ID,
    })

    expect(created.status).toBe('queued')
    expect(dependencies.published).toHaveLength(1)
  })

  /**
   * A publicação vem **depois** da linha existir. Publicar antes abriria a janela em que o worker
   * busca uma sugestão que ainda não foi gravada — e a trataria como inexistente.
   */
  test('never publishes before the row it points at exists', async () => {
    const order: string[] = []
    const dependencies = buildDependencies({
      onCreate: () => order.push('create'),
      onPublish: () => order.push('publish'),
    })

    await createRouteSuggestionUseCase(dependencies).create({
      context: COMPANY_SCOPE,
      correlationId: 'correlation-1',
      tripId: TRIP_ID,
    })

    expect(order).toEqual(['create', 'publish'])
  })

  /** A viagem que já saiu não recebe roteiro novo — `dispatched` é porta de não-retorno. */
  test('refuses a dispatched trip with 409, not a silent no-op', async () => {
    const useCase = createRouteSuggestionUseCase(buildDependencies({ tripAccepts: false }))

    const error = await useCase
      .create({ context: COMPANY_SCOPE, correlationId: 'c', tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RouteSuggestionTripDispatchedError)
    expect((error as RouteSuggestionTripDispatchedError).status).toBe(409)
  })

  test('refuses a trip that is not in this company', async () => {
    const useCase = createRouteSuggestionUseCase(buildDependencies({ tripExists: false }))

    const error = await useCase
      .create({ context: COMPANY_SCOPE, correlationId: 'c', tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RouteSuggestionNotFoundError)
  })

  /** ADR-0044 §8: a semente do chamador é respeitada, e é o que reproduz uma sugestão. */
  test('honours a caller seed and falls back to one it records', async () => {
    const withSeed = buildDependencies()
    await createRouteSuggestionUseCase(withSeed).create({
      context: COMPANY_SCOPE,
      correlationId: 'c',
      seed: 7,
      tripId: TRIP_ID,
    })

    const withoutSeed = buildDependencies({ seed: 4_242 })
    await createRouteSuggestionUseCase(withoutSeed).create({
      context: COMPANY_SCOPE,
      correlationId: 'c',
      tripId: TRIP_ID,
    })

    expect(withSeed.created[0]?.seed).toBe(7)
    expect(withoutSeed.created[0]?.seed).toBe(4_242)
  })

  /** Jornada desligada é o padrão, e a premissa gravada tem de dizer isso (D6b). */
  test('records that duty was off, which is the default', async () => {
    const dependencies = buildDependencies()

    await createRouteSuggestionUseCase(dependencies).create({
      context: COMPANY_SCOPE,
      correlationId: 'c',
      tripId: TRIP_ID,
    })

    expect(dependencies.created[0]?.assumptions.dutyEnabled).toBe(false)
  })
})

describe('accepting a route suggestion (ADR-0044 §5)', () => {
  /**
   * O aceite escreve pela **mesma rota da 056**. Se ele tivesse caminho próprio, existiriam duas
   * regras para reordenar parada, e a segunda esqueceria a porta de não-retorno que a primeira
   * respeita.
   */
  test('writes the order through the reorder path, not around it', async () => {
    const dependencies = buildDependencies({ suggestion: READY_RECORD })

    await createRouteSuggestionUseCase(dependencies).accept({
      context: COMPANY_SCOPE,
      suggestionId: SUGGESTION_ID,
      tripId: TRIP_ID,
    })

    expect(dependencies.reordered).toHaveLength(1)
    expect(dependencies.reordered[0]?.orderedStopIds).toEqual(['stop-1', 'stop-2'])
  })

  /**
   * A ordem é escrita **antes** de a sugestão virar `accepted`. O contrário deixaria uma sugestão
   * marcada como aceita sem que roteiro nenhum tivesse mudado.
   */
  test('leaves the suggestion ready when writing the order fails', async () => {
    const dependencies = buildDependencies({
      reorderError: new Error('trip already dispatched'),
      suggestion: READY_RECORD,
    })

    await createRouteSuggestionUseCase(dependencies)
      .accept({ context: COMPANY_SCOPE, suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
      .catch(() => undefined)

    expect(dependencies.decided).toHaveLength(0)
  })

  /**
   * A viagem é conferida **de novo** no aceite: entre pedir a sugestão e aceitá-la ela pode ter
   * saído, e aplicar roteiro a viagem despachada é reescrever o que já rodou.
   */
  test('re-checks the trip at acceptance, not only at creation', async () => {
    const dependencies = buildDependencies({ suggestion: READY_RECORD, tripAccepts: false })

    const error = await createRouteSuggestionUseCase(dependencies)
      .accept({ context: COMPANY_SCOPE, suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RouteSuggestionTripDispatchedError)
    expect(dependencies.reordered).toHaveLength(0)
  })

  /** Aceitar uma `stale` aplicaria o roteiro de uma viagem que já mudou. */
  test('refuses to decide anything that is not ready', async () => {
    for (const status of ['queued', 'running', 'accepted', 'rejected', 'stale'] as const) {
      const dependencies = buildDependencies({ suggestion: { ...READY_RECORD, status } })

      const error = await createRouteSuggestionUseCase(dependencies)
        .accept({ context: COMPANY_SCOPE, suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(RouteSuggestionNotDecidableError)
    }
  })

  /** Duas aceitações concorrentes: a segunda encontra a linha já decidida e para. */
  test('refuses the second acceptance when the row was already decided', async () => {
    const dependencies = buildDependencies({ decideReturnsNull: true, suggestion: READY_RECORD })

    const error = await createRouteSuggestionUseCase(dependencies)
      .accept({ context: COMPANY_SCOPE, suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RouteSuggestionNotDecidableError)
  })

  test('refuses a suggestion that belongs to another trip', async () => {
    const dependencies = buildDependencies({ suggestion: { ...READY_RECORD, tripId: 'other' } })

    const error = await createRouteSuggestionUseCase(dependencies)
      .accept({ context: COMPANY_SCOPE, suggestionId: SUGGESTION_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RouteSuggestionNotFoundError)
  })
})

describe('rejecting a route suggestion (ADR-0044 §5)', () => {
  /** A rejeição é gravada: é o que transforma "a sugestão está boa?" em número, não em opinião. */
  test('records the rejection instead of just discarding it', async () => {
    const dependencies = buildDependencies({ suggestion: READY_RECORD })

    const rejected = await createRouteSuggestionUseCase(dependencies).reject({
      context: COMPANY_SCOPE,
      reason: 'o centro trava às 16h',
      suggestionId: SUGGESTION_ID,
      tripId: TRIP_ID,
    })

    expect(rejected.status).toBe('rejected')
    expect(dependencies.decided[0]?.status).toBe('rejected')
  })

  /** Rejeitar não reordena nada — a viagem fica como estava. */
  test('never touches the stop order', async () => {
    const dependencies = buildDependencies({ suggestion: READY_RECORD })

    await createRouteSuggestionUseCase(dependencies).reject({
      context: COMPANY_SCOPE,
      suggestionId: SUGGESTION_ID,
      tripId: TRIP_ID,
    })

    expect(dependencies.reordered).toHaveLength(0)
  })
})
