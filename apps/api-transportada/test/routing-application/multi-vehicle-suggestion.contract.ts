/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  MultiVehicleSuggestionGroup,
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
    readonly groups?: readonly MultiVehicleSuggestionGroup[]
    readonly stored?: RouteSuggestionRecord | null
    readonly unavailableDocuments?: readonly string[]
    readonly unavailableDrivers?: readonly string[]
    readonly unavailableVehicles?: readonly string[]
  } = {},
) {
  const calls: Record<string, unknown[]> = {
    create: [],
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
  }

  const suggestions: RouteSuggestionRepository = {
    create: async () => suggestion(),
    async decide(record) {
      calls.decide?.push(record)
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
          orderedAddressKeys: [],
          vehicleId: FIRST_VEHICLE,
        },
        {
          documentIds: [SECOND_DOCUMENT],
          driverId: null,
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
          orderedAddressKeys: ['3543402|14020000|100'],
          vehicleId: FIRST_VEHICLE,
        },
        {
          documentIds: [SECOND_DOCUMENT],
          driverId: null,
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
        stopCount: 1,
        tripId: 'trip-1',
        vehicleId: FIRST_VEHICLE,
      },
      {
        documentCount: 1,
        driverId: null,
        stopCount: 1,
        tripId: 'trip-2',
        vehicleId: SECOND_VEHICLE,
      },
    ])
    expect(fixture.calls.link).toHaveLength(2)
    expect(fixture.calls.reorder).toHaveLength(2)
    expect(fixture.calls.plan).toHaveLength(2)
    /** A sugestão vira `accepted` **depois** das viagens: falha no meio deixa `ready` para repetir. */
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
          orderedAddressKeys: [],
          vehicleId: SECOND_VEHICLE,
        },
        {
          documentIds: [FIRST_DOCUMENT],
          driverId: null,
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
