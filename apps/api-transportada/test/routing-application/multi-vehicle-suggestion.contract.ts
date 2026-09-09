/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  MultiVehicleSuggestionGroup,
  MultiVehicleSuggestionRoad,
  MultiVehicleSuggestionRepository,
} from '../../src/routing/application/multi-vehicle-suggestion.repository.js'
import {
  createMultiVehicleSuggestionUseCase,
  type TripComposer,
} from '../../src/routing/application/multi-vehicle-suggestion.use-case.js'
import type { MultiVehicleScope } from '../../src/routing/application/multi-vehicle-suggestion.port.js'
import type {
  RouteSuggestionRecord,
  RouteSuggestionRepository,
} from '../../src/routing/application/route-suggestion.repository.js'
import {
  MultiVehicleSuggestionDocumentUnavailableError,
  MultiVehicleSuggestionDriverRepeatedError,
  MultiVehicleSuggestionDriverUnavailableError,
  MultiVehicleSuggestionEmptyError,
  MultiVehicleSuggestionVehicleUnavailableError,
  RouteSuggestionNotDecidableError,
  RouteSuggestionNotFoundError,
} from '../../src/routing/domain/routing.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000003'
const FIRST_VEHICLE = '00000000-0000-4000-8000-000000000010'
const SECOND_VEHICLE = '00000000-0000-4000-8000-000000000011'
const FIRST_DRIVER = '00000000-0000-4000-8000-000000000030'
const FIRST_DOCUMENT = '00000000-0000-4000-8000-000000000020'
const SECOND_DOCUMENT = '00000000-0000-4000-8000-000000000021'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as unknown as MultiVehicleScope

const SETTINGS = {
  defaultServiceTimeSeconds: 600,
  duty: {
    breakEverySeconds: null,
    mandatoryBreakSeconds: null,
    maxDrivingSeconds: null,
    maxDutySeconds: null,
  },
  endAddressKey: '',
  endPolicy: 'depot' as const,
  fallbackAverageSpeedKph: 30,
  fallbackWeightKilograms: '0.00',
  originAddressKey: 'depot',
  serviceTimeMinimumSamples: 5,
  solverTimeBudgetSeconds: 30,
}

function suggestion(overrides: Partial<RouteSuggestionRecord> = {}): RouteSuggestionRecord {
  return {
    assumptions: {
      dutyEnabled: false,
      endPolicy: 'depot',
      fallbackWeightKilograms: '0.00',
      originAddressKey: 'depot',
      serviceTimeSeconds: 600,
      serviceTimeSource: 'default',
      solverTimeBudgetSeconds: 30,
    },
    createdAt: '2026-08-27T10:00:00.000Z',
    decidedAt: null,
    errorCode: '',
    estimatedCostAmount: null,
    estimatedDistanceMeters: null,
    estimatedDurationSeconds: null,
    id: SUGGESTION_ID,
    seed: 7,
    status: 'ready',
    stops: [],
    tripId: null,
    truncated: false,
    updatedAt: '2026-08-27T10:00:00.000Z',
    vehicleId: null,
    ...overrides,
  }
}

function buildFixture(
  input: {
    /** Spec 107 D1: as notas que o vínculo recusa por já estarem vivas em outra viagem. */
    readonly alreadyLinkedDocumentIds?: readonly string[]
    /** Spec 107 D2: simula a reivindicação perdida para outro pedido concorrente. */
    readonly claimFails?: boolean
    readonly groups?: readonly MultiVehicleSuggestionGroup[]
    readonly vehicleRoads?: readonly MultiVehicleSuggestionRoad[]
    readonly stored?: RouteSuggestionRecord | null
    readonly unavailableDocuments?: readonly string[]
    readonly unavailableDrivers?: readonly string[]
    readonly unavailableVehicles?: readonly string[]
  } = {},
) {
  const calls: Record<string, unknown[]> = {
    create: [],
    arrivals: [],
    decide: [],
    link: [],
    plan: [],
    publish: [],
    reorder: [],
    trip: [],
  }

  const multiVehicle: MultiVehicleSuggestionRepository = {
    async create(record) {
      calls.create?.push(record)
      return suggestion({ status: 'queued' })
    },
    findUnavailableDocumentIds: async () => input.unavailableDocuments ?? [],
    findUnavailableDriverIds: async () => input.unavailableDrivers ?? [],
    findUnavailableVehicleIds: async () => input.unavailableVehicles ?? [],
    readGroups: async () => input.groups ?? [],
    readSuggestionStatus: async () => 'ready',
    readVehicleRoads: async () => input.vehicleRoads ?? [],
  }

  const suggestions: RouteSuggestionRepository = {
    create: async () => suggestion(),
    /** Spec 107 D2: a compensação do aceite — devolve a sugestão reivindicada para `ready`. */
    release: async () => undefined,
    async decide(record) {
      calls.decide?.push(record)
      /** Spec 107 D2: `null` é "outro pedido chegou antes" — o `where status = 'ready'` não casou. */
      if (input.claimFails === true) return null

      return suggestion({ decidedAt: '2026-08-27T11:00:00.000Z', status: record.status })
    },
    find: async () => (input.stored === undefined ? suggestion() : input.stored),
    readSettings: async () => SETTINGS,
  }

  let tripCounter = 0
  const trips: TripComposer = {
    async createTrip(record) {
      calls.trip?.push(record)
      tripCounter += 1
      return { tripId: `trip-${tripCounter}` }
    },
    async linkDocument(record) {
      calls.link?.push(record)

      /** Spec 107 D1: `false` é "já vinculada" — o aceite pula e nomeia, em vez de derrubar tudo. */
      return input.alreadyLinkedDocumentIds?.includes(record.nfeDocumentId) !== true
    },
    /** Spec 107 D3: o duplo registra a chamada — o contrato afirma que ela acontece. */
    async applyEstimatedArrivals(record) {
      calls.arrivals?.push(record)
    },
    async planRoute(record) {
      calls.plan?.push(record)
    },
    async reorderStops(record) {
      calls.reorder?.push(record)
    },
  }

  const useCase = createMultiVehicleSuggestionUseCase({
    createSeed: () => 42,
    multiVehicle,
    queue: {
      async publish(record) {
        calls.publish?.push(record)
      },
    },
    suggestions,
    trips,
  })

  return { calls, useCase }
}

describe('a sugestão multi-veículo (spec 058 P2)', () => {
  /** Sem nota ou sem veículo não há problema a resolver — e uma sugestão vazia sairia parecendo resposta. */
  test('recusa pool sem nota e sem veículo, antes de qualquer consulta', async () => {
    const fixture = buildFixture()

    await expect(
      fixture.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [],
        vehicles: [{ vehicleId: FIRST_VEHICLE }],
      }),
    ).rejects.toBeInstanceOf(MultiVehicleSuggestionEmptyError)

    await expect(
      fixture.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [FIRST_DOCUMENT],
        vehicles: [],
      }),
    ).rejects.toBeInstanceOf(MultiVehicleSuggestionEmptyError)

    expect(fixture.calls.create).toEqual([])
  })

  /** Nota já em viagem tem parada, ordem e responsável: no pool, ela seria proposta duas vezes. */
  test('recusa nota indisponível e veículo indisponível, com o id no detalhe', async () => {
    const documents = buildFixture({ unavailableDocuments: [SECOND_DOCUMENT] })
    await expect(
      documents.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [FIRST_DOCUMENT, SECOND_DOCUMENT],
        vehicles: [{ vehicleId: FIRST_VEHICLE }],
      }),
    ).rejects.toBeInstanceOf(MultiVehicleSuggestionDocumentUnavailableError)

    const vehicles = buildFixture({ unavailableVehicles: [FIRST_VEHICLE] })
    await expect(
      vehicles.useCase.create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [FIRST_DOCUMENT],
        vehicles: [{ vehicleId: FIRST_VEHICLE }],
      }),
    ).rejects.toBeInstanceOf(MultiVehicleSuggestionVehicleUnavailableError)
  })

  /**
   * Spec 081 (RF-3): motorista inexistente, de outra empresa ou inativo. Os três motivos respondem
   * junto — quem está do outro lado só precisa saber "não use este".
   */
  test('recusa motorista indisponível, com o id no detalhe', async () => {
    const fixture = buildFixture({ unavailableDrivers: [FIRST_DRIVER] })

    const refusal = await fixture.useCase
      .create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [FIRST_DOCUMENT],
        vehicles: [{ driverId: FIRST_DRIVER, vehicleId: FIRST_VEHICLE }],
      })
      .then(() => null)
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(MultiVehicleSuggestionDriverUnavailableError)
    expect((refusal as MultiVehicleSuggestionDriverUnavailableError).details).toEqual([
      { field: 'driverIds', message: FIRST_DRIVER },
    ])
    expect(fixture.calls.create).toEqual([])
  })

  /**
   * RF-2: a repetição do motorista é **recusa**, não deduplicação como a do veículo. Descartar em
   * silêncio deixaria um caminhão sem motorista sem ninguém saber por quê — e aceitar criaria duas
   * viagens simultâneas da mesma pessoa, que o PWA dela mostraria juntas.
   */
  test('recusa o mesmo motorista em dois pares, antes de qualquer consulta', async () => {
    const fixture = buildFixture()

    const refusal = await fixture.useCase
      .create({
        context: CONTEXT,
        correlationId: 'correlation',
        documentIds: [FIRST_DOCUMENT],
        vehicles: [
          { driverId: FIRST_DRIVER, vehicleId: FIRST_VEHICLE },
          { driverId: FIRST_DRIVER, vehicleId: SECOND_VEHICLE },
        ],
      })
      .then(() => null)
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(MultiVehicleSuggestionDriverRepeatedError)
    expect(fixture.calls.create).toEqual([])
  })

  /** Par sem motorista continua legítimo: é a distribuição da véspera, antes de a escala existir. */
  test('aceita pares sem motorista misturados com pares com motorista', async () => {
    const fixture = buildFixture()

    await fixture.useCase.create({
      context: CONTEXT,
      correlationId: 'correlation',
      documentIds: [FIRST_DOCUMENT],
      vehicles: [
        { driverId: FIRST_DRIVER, vehicleId: FIRST_VEHICLE },
        { vehicleId: SECOND_VEHICLE },
      ],
    })

    expect(fixture.calls.create?.[0]).toMatchObject({
      vehicles: [
        { driverId: FIRST_DRIVER, vehicleId: FIRST_VEHICLE },
        { vehicleId: SECOND_VEHICLE },
      ],
    })
  })

  /**
   * ADR-0055: é aqui que a viagem passa a existir para quem dirige. O caminho de leitura do PWA
   * parte de `trip_drivers`, e viagem sem linha ali não aparece para o motorista.
   */
  test('o aceite cria a viagem com o motorista do par, e sem ele quando o par não trouxe nenhum', async () => {
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: FIRST_DRIVER,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: FIRST_VEHICLE,
        },
        {
          documentIds: [SECOND_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: SECOND_VEHICLE,
        },
      ],
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.trips.map((trip) => trip.driverId)).toEqual([FIRST_DRIVER, null])
    expect(fixture.calls.trip).toMatchObject([
      { driverId: FIRST_DRIVER, vehicleId: FIRST_VEHICLE },
      { driverId: null, vehicleId: SECOND_VEHICLE },
    ])
  })

  /** Publicar antes de a linha existir abriria a janela em que o worker busca o que não foi gravado. */
  test('grava o pool, deduplica e só então publica', async () => {
    const fixture = buildFixture()

    await fixture.useCase.create({
      context: CONTEXT,
      correlationId: 'correlation',
      documentIds: [FIRST_DOCUMENT, FIRST_DOCUMENT, SECOND_DOCUMENT],
      vehicles: [{ vehicleId: FIRST_VEHICLE }, { vehicleId: FIRST_VEHICLE }],
    })

    expect(fixture.calls.create).toEqual([
      {
        assumptions: {
          dutyEnabled: false,
          endPolicy: 'depot',
          fallbackWeightKilograms: '0.00',
          originAddressKey: 'depot',
          serviceTimeSeconds: 600,
          serviceTimeSource: 'default',
          solverTimeBudgetSeconds: 30,
        },
        companyId: COMPANY_ID,
        documentIds: [FIRST_DOCUMENT, SECOND_DOCUMENT],
        seed: 42,
        vehicles: [{ vehicleId: FIRST_VEHICLE }],
      },
    ])
    expect(fixture.calls.publish).toHaveLength(1)
  })

  /**
   * ADR-0044 §5 aplicado à P2: o aceite **cria** viagem, mas não escreve viagem — ele chama os casos
   * de uso da 056, um por veículo, e as viagens saem em `route_planned`.
   */
  test('o aceite cria uma viagem por veículo, vincula, ordena e planeja', async () => {
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: ['3543402|14020000|100'],
          vehicleId: FIRST_VEHICLE,
        },
        {
          documentIds: [SECOND_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: ['3543402|14020000|200'],
          vehicleId: SECOND_VEHICLE,
        },
      ],
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.trips).toEqual([
      {
        documentCount: 1,
        driverId: null,
        estimatedFinishAt: null,
        stopCount: 1,
        tripId: 'trip-1',
        vehicleId: FIRST_VEHICLE,
      },
      {
        documentCount: 1,
        driverId: null,
        estimatedFinishAt: null,
        stopCount: 1,
        tripId: 'trip-2',
        vehicleId: SECOND_VEHICLE,
      },
    ])
    expect(fixture.calls.link).toHaveLength(2)
    expect(fixture.calls.reorder).toHaveLength(2)
    expect(fixture.calls.plan).toHaveLength(2)
    /**
     * ⚠️ Spec 107 D2: a sugestão é reivindicada **antes** das viagens — a ordem inversa deixava dois
     * aceites concorrentes passarem os dois pela janela de onze segundos. A retomada que a ordem
     * antiga protegia vive agora na escrita compensatória (`release`).
     */
    expect(fixture.calls.decide).toEqual([
      {
        companyId: COMPANY_ID,
        decidedByUserId: USER_ID,
        status: 'accepted',
        suggestionId: SUGGESTION_ID,
      },
    ])
  })

  /**
   * ⚠️ Spec 107 D1: o aceite de 345 notas terminou em `TRIP_DOCUMENT_ALREADY_LINKED` com **cinco
   * viagens já criadas e corretas**, e o operador leu um código de suporte no lugar do roteiro
   * pronto. Nota já viva em outra viagem é **pulada e nomeada** — a diferença entre "o roteiro
   * falhou" e "o roteiro saiu, e estas ficaram de fora porque já estão em rota".
   */
  test('pula a nota já vinculada e a devolve nomeada', async () => {
    const fixture = buildFixture({
      alreadyLinkedDocumentIds: [SECOND_DOCUMENT],
      groups: [
        {
          documentIds: [FIRST_DOCUMENT, SECOND_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: ['chave-1'],
          vehicleId: FIRST_VEHICLE,
        },
      ],
      stored: suggestion({ status: 'ready' }),
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.skippedDocuments).toEqual([
      { nfeDocumentId: SECOND_DOCUMENT, reason: 'already_linked' },
    ])
    /** ⚠️ A contagem é do que **ficou**, não do que foi tentado: senão a tela mentiria o total. */
    expect(accepted.trips[0]?.documentCount).toBe(1)
  })

  /**
   * ⚠️ Spec 107 D2: `decide` é condicional (`where status = 'ready'`) e passou a ser chamado
   * **primeiro**. Antes ele rodava depois de onze segundos criando viagens, e dois pedidos nessa
   * janela passavam os dois — medido: o segundo criou uma viagem órfã e morreu ao vincular.
   */
  test('o aceite que perde a reivindicação não cria viagem nenhuma', async () => {
    const fixture = buildFixture({
      claimFails: true,
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: ['chave-1'],
          vehicleId: FIRST_VEHICLE,
        },
      ],
      stored: suggestion({ status: 'ready' }),
    })

    await expect(
      fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID }),
    ).rejects.toBeInstanceOf(RouteSuggestionNotDecidableError)

    /** ⚠️ **Zero viagens.** Era daqui que nascia a órfã com zero notas do aceite duplicado. */
    expect(fixture.calls.trip).toEqual([])
  })

  /**
   * ⚠️ Spec 107 D3: **o ETA morria na sugestão.** Medido em 2026-09-09: `route_suggestion_stops`
   * tinha 873 de 950 paradas com hora estimada e `trip_stops` tinha **0 de 869** — não existia hora
   * de término de viagem em lugar nenhum do sistema, e a frase "o RTD5J78 termina por volta das 14h"
   * não tinha de onde sair.
   */
  test('leva para a viagem o ETA que o planejamento calculou', async () => {
    const arrivals = new Map([['chave-1', '2026-09-09T17:00:00.000Z']])
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: arrivals,
          orderedAddressKeys: ['chave-1'],
          vehicleId: FIRST_VEHICLE,
        },
      ],
      stored: suggestion({ status: 'ready' }),
    })

    await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(fixture.calls.arrivals).toEqual([
      { context: CONTEXT, estimatedArrivalByAddressKey: arrivals, tripId: 'trip-1' },
    ])
  })

  /**
   * ⚠️ Spec 107 D3: **o término é o ETA da última parada**, e ele sai do mesmo mapa que acabou de
   * ser gravado — não de uma segunda leitura do banco. É o que a frase da sobra imprime ("o RTD5J78
   * termina por volta das 14h"), e é a única metade dela que existe sem consultar cobertura.
   *
   * O maior, nunca o último da ordem de inserção: `Map` preserva ordem de escrita, e a ordem de
   * escrita é a das paradas propostas, que a reordenação pode não seguir.
   */
  test('o término da viagem é o ETA mais tardio entre as paradas dela', async () => {
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map([
            ['chave-2', '2026-09-09T17:00:00.000Z'],
            ['chave-1', '2026-09-09T19:30:00.000Z'],
            ['chave-3', '2026-09-09T12:00:00.000Z'],
          ]),
          orderedAddressKeys: ['chave-1', 'chave-2', 'chave-3'],
          vehicleId: FIRST_VEHICLE,
        },
      ],
      stored: suggestion({ status: 'ready' }),
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.trips[0]?.estimatedFinishAt).toBe('2026-09-09T19:30:00.000Z')
  })

  /**
   * ⚠️ Ausência é `null`, **nunca a hora de agora**: o planejamento sem ETA é o caso em que a tela
   * tem de calar, e uma hora inventada ali diria ao operador que o caminhão volta às sete quando
   * ninguém sabe se ele volta.
   */
  test('planejamento sem ETA nenhum não inventa término', async () => {
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: ['chave-1'],
          vehicleId: FIRST_VEHICLE,
        },
      ],
      stored: suggestion({ status: 'ready' }),
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.trips[0]?.estimatedFinishAt).toBe(null)
  })

  /**
   * Sugestão **de viagem** não se decide por aqui: as duas rotas moram em árvores diferentes, e
   * responder pela outra faria o aceite de uma viagem existente criar viagem nova.
   */
  test('ignora sugestão que pertence a uma viagem', async () => {
    const fixture = buildFixture({ stored: suggestion({ tripId: 'trip-existente' }) })

    await expect(
      fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID }),
    ).rejects.toBeInstanceOf(RouteSuggestionNotFoundError)
    expect(fixture.calls.trip).toEqual([])
  })

  /** Só `ready` se decide: aceitar o que ainda está na fila aplicaria roteiro que não existe. */
  test('recusa aceitar sugestão que não está pronta', async () => {
    const fixture = buildFixture({ stored: suggestion({ status: 'queued' }) })

    await expect(
      fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID }),
    ).rejects.toBeInstanceOf(RouteSuggestionNotDecidableError)
    expect(fixture.calls.trip).toEqual([])
  })

  /** Rejeitar é gravado: é o que transforma "a sugestão está boa?" em número. */
  test('a rejeição não cria viagem nenhuma', async () => {
    const fixture = buildFixture()

    await fixture.useCase.reject({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(fixture.calls.trip).toEqual([])
    expect(fixture.calls.decide).toEqual([
      {
        companyId: COMPANY_ID,
        decidedByUserId: USER_ID,
        status: 'rejected',
        suggestionId: SUGGESTION_ID,
      },
    ])
  })

  /**
   * O determinismo do RNF depende da **ordem dos grupos**, e ela é a ordem da frota oferecida — não a
   * dos ids. Este teste guarda o contrato do repositório: o que ele devolver primeiro é a primeira
   * viagem criada, e o aceite não reordena nada.
   */
  test('cria as viagens na ordem em que o repositório devolve os grupos', async () => {
    const fixture = buildFixture({
      groups: [
        {
          documentIds: [SECOND_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: SECOND_VEHICLE,
        },
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: FIRST_VEHICLE,
        },
      ],
    })

    const accepted = await fixture.useCase.accept({ context: CONTEXT, suggestionId: SUGGESTION_ID })

    expect(accepted.trips.map((trip) => trip.vehicleId)).toEqual([SECOND_VEHICLE, FIRST_VEHICLE])
    /** Sem endereço proposto não há o que reordenar — e chamar a reordenação com lista vazia é recusa. */
    expect(fixture.calls.reorder).toEqual([])
  })
})
