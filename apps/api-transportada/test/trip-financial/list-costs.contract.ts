/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 aceite 7: viagem de outra empresa devolve 404, nunca 403 — 403 confirmaria a existência
 * da viagem para quem nem deveria saber que ela existe. O repositório expressa isso devolvendo
 * `null`, e é o use case que converte isso em `TripNotFoundError`. O nome do autor (aceite 6) tem
 * cadeia de fallback própria, testada aqui direto na função pura, sem precisar de Postgres.
 */
import { describe, expect, it } from 'bun:test'

import { resolveActorName } from '../../src/trips/infrastructure/drizzle-trip-cost.repository.js'
import {
  listTripCosts,
  type TripCostEntryView,
  type TripCostListPort,
} from '../../src/trips/application/list-trip-costs.use-case.js'
import { TripNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'

function entry(overrides: Partial<TripCostEntryView> = {}): TripCostEntryView {
  return {
    actor: { name: 'Ana Souza', userId: crypto.randomUUID() },
    amount: '44.6000',
    createdAt: '2026-08-05T09:00:00.000Z',
    description: 'Pedágio da BR-101',
    entryKind: null,
    id: crypto.randomUUID(),
    kind: 'toll',
    ...overrides,
  }
}

function buildRepository(entries: readonly TripCostEntryView[] | null): TripCostListPort {
  return { listByTrip: () => Promise.resolve(entries) }
}

function list(repository: TripCostListPort) {
  return listTripCosts({ companyId: COMPANY_ID, repository, tripId: TRIP_ID })
}

describe('os lançamentos de custo da viagem, com o autor (spec 143 aceites 6 e 7)', () => {
  it('devolve os lançamentos como o repositório entregou: kind, amount, description, createdAt, actor', async () => {
    const entries = [entry(), entry({ kind: 'other', description: 'Balsa' })]

    const result = await list(buildRepository(entries))

    expect(result).toEqual(entries)
  })

  it('viagem de outra empresa não é encontrada — 404, nunca 403', async () => {
    const attempt = list(buildRepository(null))

    await expect(attempt).rejects.toBeInstanceOf(TripNotFoundError)
  })
})

describe('o nome de quem lançou, com a cadeia de fallback (spec 143 D6)', () => {
  it('usa o nome do perfil quando existe', () => {
    const name = resolveActorName({ actorEmail: 'ana@example.com', actorName: 'Ana Souza' })

    expect(name).toBe('Ana Souza')
  })

  it('cai para o e-mail quando o nome vem em branco', () => {
    const name = resolveActorName({ actorEmail: 'ana@example.com', actorName: '  ' })

    expect(name).toBe('ana@example.com')
  })

  it('cai para "usuário removido" quando o join não encontra perfil nenhum', () => {
    const name = resolveActorName({ actorEmail: null, actorName: null })

    expect(name).toBe('usuário removido')
  })
})
