/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T704 (M1, M3, M4), sem banco: o que importa aqui é a **forma** das escritas, e ela é
 * decidível lendo o SQL montado.
 *
 * - M1: a limpeza zera o grupo inteiro de `planned_*` — os CHECKs `trips_planned_route_check` e
 *   `trips_planned_toll_check` são tudo-ou-nada, e campo solto rejeitaria a transação.
 * - M3: a escrita do congelamento carrega guarda de status **e** compare-and-set, para que um
 *   congelamento nascido de estado obsoleto não escreva nada em vez de sobrescrever.
 * - M4: parada sem coordenada devolve `null` — nunca o subconjunto que teria coordenada, que
 *   viraria rota parcial e distância parcial alimentando combustível e valoração.
 */
import { describe, expect, test } from 'bun:test'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import type { WritePlannedRouteInput } from '../../src/trips/application/freeze-trip-planned-route.use-case.js'
import { DrizzleTripPlannedRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-planned-route.repository.js'
import {
  CLEARED_PLANNED_ROUTE_COLUMNS,
  clearPlannedRoute,
} from '../../src/trips/infrastructure/trip-planned-route-clear.support.js'
import { listTripStopCoordinates } from '../../src/trips/infrastructure/trip-stop-coordinates.support.js'
import type {
  TripDatabase,
  TripQueryable,
} from '../../src/trips/infrastructure/trip-queryable.type.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-0000000000t1'

const dialect = new PgDialect()

function renderCondition(condition: SQL | undefined): string {
  if (condition === undefined) throw new Error('escrita sem where — recorte por empresa perdido')
  return dialect.sqlToQuery(condition).sql
}

type RecordedUpdate = { condition?: SQL; values?: Record<string, unknown> }

function createUpdateRecorder(): {
  readonly recorded: RecordedUpdate
  readonly queryable: TripQueryable
} {
  const recorded: RecordedUpdate = {}
  const queryable = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        recorded.values = values
        return {
          where: async (condition: SQL) => {
            recorded.condition = condition
          },
        }
      },
    }),
  } as unknown as TripQueryable

  return { queryable, recorded }
}

describe('T704 M1: a limpeza de planned_* zera o grupo inteiro', () => {
  test('nenhuma das sete colunas fica de fora — o CHECK é tudo-ou-nada', async () => {
    const { queryable, recorded } = createUpdateRecorder()

    await clearPlannedRoute(queryable, { companyId: COMPANY_ID, tripId: TRIP_ID })

    for (const column of CLEARED_PLANNED_ROUTE_COLUMNS) {
      expect(recorded.values?.[column]).toBeNull()
    }
    expect(CLEARED_PLANNED_ROUTE_COLUMNS).toHaveLength(7)
  })

  /** A rota da viagem despachada é o congelado que vale — limpar ali apagaria o roteiro da rua. */
  test('só alcança viagem ainda não despachada, dentro da empresa', async () => {
    const { queryable, recorded } = createUpdateRecorder()

    await clearPlannedRoute(queryable, { companyId: COMPANY_ID, tripId: TRIP_ID })

    const condition = renderCondition(recorded.condition)
    expect(condition).toContain('company_id')
    expect(condition).toContain('"status" in')
  })
})

describe('T704 M3: a escrita do congelamento não atropela estado mais novo', () => {
  function createRepositoryRecorder(): {
    readonly recorded: RecordedUpdate
    readonly repository: DrizzleTripPlannedRouteRepository
  } {
    const recorded: RecordedUpdate = {}
    const database = {
      /**
       * T802: quando o UPDATE afeta zero linhas (o caso aqui — o mock nunca "acha" a linha), o
       * repositório faz uma segunda leitura para distinguir o motivo do descarte. Este `select`
       * devolve nenhuma linha, então `diagnosePlannedRouteWriteDiscard` cai no fallback
       * `'stale_revision'` — irrelevante para o que estes dois testes provam (a forma do UPDATE).
       */
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          recorded.values = values
          return {
            where: (condition: SQL) => {
              recorded.condition = condition
              return { returning: async () => [] }
            },
          }
        },
      }),
    } as unknown as TripDatabase

    return { recorded, repository: new DrizzleTripPlannedRouteRepository(database) }
  }

  const WRITE: WritePlannedRouteInput = {
    companyId: COMPANY_ID,
    expectedRevision: '2026-09-17 12:00:00.123456+00',
    route: null,
    toll: null,
    tripId: TRIP_ID,
  }

  test('a viagem já despachada fica fora do alcance da escrita', async () => {
    const { recorded, repository } = createRepositoryRecorder()

    await repository.writePlannedRoute(WRITE)

    expect(renderCondition(recorded.condition)).toContain('"status" in')
  })

  test('compare-and-set pela revisão das paradas lida no disparo — estado obsoleto não escreve nada', async () => {
    const { recorded, repository } = createRepositoryRecorder()

    await repository.writePlannedRoute(WRITE)

    const query = dialect.sqlToQuery(recorded.condition as SQL)
    /** T802: a revisão comparada é `planned_route_stops_revision`, não mais `updated_at`. */
    expect(query.sql).toContain('planned_route_stops_revision')
    expect(query.params).toContain(WRITE.expectedRevision)
  })
})

describe('T704 M4: parada sem coordenada não vira rota parcial', () => {
  type GeocodedRow = { readonly latitude: string | null; readonly longitude: string | null }

  function createSelectRecorder(rows: readonly GeocodedRow[]): TripQueryable {
    const chain = {
      from: () => chain,
      leftJoin: () => chain,
      orderBy: async () => rows,
      where: () => chain,
    }
    return { select: () => chain } as unknown as TripQueryable
  }

  test('uma parada sem coordenada devolve null — nunca o subconjunto geocodificado', async () => {
    const coordinates = await listTripStopCoordinates(
      createSelectRecorder([
        { latitude: '-21.1775', longitude: '-47.8103' },
        { latitude: null, longitude: null },
      ]),
      { companyId: COMPANY_ID, tripId: TRIP_ID },
    )

    expect(coordinates).toBeNull()
  })

  test('todas geocodificadas devolvem a sequência inteira', async () => {
    const coordinates = await listTripStopCoordinates(
      createSelectRecorder([
        { latitude: '-21.1775', longitude: '-47.8103' },
        { latitude: '-21.9967', longitude: '-47.4256' },
      ]),
      { companyId: COMPANY_ID, tripId: TRIP_ID },
    )

    expect(coordinates).toEqual([
      { latitude: -21.1775, longitude: -47.8103 },
      { latitude: -21.9967, longitude: -47.4256 },
    ])
  })

  /** Viagem sem parada nenhuma continua sendo "nada a traçar", não "coordenada faltando". */
  test('viagem sem parada devolve lista vazia', async () => {
    const coordinates = await listTripStopCoordinates(createSelectRecorder([]), {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    expect(coordinates).toEqual([])
  })
})
