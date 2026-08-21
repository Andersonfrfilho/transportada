/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { LOCAL_FLEET_DRIVER_SEEDS } from '../../src/database/local-fleet-seed.constant.js'
import { seedLocalFleetDrivers } from '../../src/database/local-fleet-seed.service.js'
import { FLEET_DRIVER_PROFILES } from '../../src/fleet/domain/fleet-driver-profile.constant.js'
import type {
  CreateFleetDriverInput,
  FleetDriversUseCase,
} from '../../src/fleet/application/fleet-drivers.use-case.js'
import type { FleetDriver } from '../../src/fleet/application/fleet.port.js'
import { FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'

const CORRELATION_ID = 'local-fleet-seed'

function createUseCaseStub(existing: readonly string[] = []): {
  readonly calls: CreateFleetDriverInput[]
  readonly useCase: FleetDriversUseCase
} {
  const calls: CreateFleetDriverInput[] = []
  const stored = [...existing]

  return {
    calls,
    useCase: {
      checkAvailability: async () => {
        throw new Error('the seed never checks availability')
      },
      create: async (input) => {
        calls.push(input)
        stored.push(input.driver.taxId)
        return { ...input.driver, membershipId: null } as unknown as FleetDriver
      },
      list: async () => ({
        items: stored.map((taxId) => ({ taxId }) as unknown as FleetDriver),
        nextCursor: null,
      }),
      update: async () => {
        throw new Error('the seed never updates a driver')
      },
    },
  }
}

describe('local fleet seed contract', () => {
  /** A seleção de proprietário só tem o que mostrar se a semente trouxer os dois perfis. */
  test('a semente cobre os dois perfis do catálogo', () => {
    const profiles = new Set(LOCAL_FLEET_DRIVER_SEEDS.map((seed) => seed.profile))

    expect([...profiles].sort()).toEqual([...FLEET_DRIVER_PROFILES].sort())
    expect(LOCAL_FLEET_DRIVER_SEEDS.length).toBeGreaterThanOrEqual(4)
  })

  /** Sem contato o convite é recusado na fronteira, e a semente morreria no primeiro motorista. */
  test('todo motorista da semente tem documento único e um contato', () => {
    const taxIds = LOCAL_FLEET_DRIVER_SEEDS.map((seed) => seed.driver.taxId)

    expect(new Set(taxIds).size).toBe(taxIds.length)
    for (const { driver } of LOCAL_FLEET_DRIVER_SEEDS) {
      expect(driver.name.length).toBeGreaterThan(0)
      expect(driver.taxId).toMatch(/^[0-9]{11}$/)
      expect(driver.email === '' && driver.phone === '').toBe(false)
    }
  })

  /** O agregado é o dono do veículo dele: sem RNTRC e categoria ANTT o MDF-e não fecha. */
  test('o agregado da semente traz RNTRC e categoria ANTT', () => {
    const aggregates = LOCAL_FLEET_DRIVER_SEEDS.filter((seed) => seed.profile === 'aggregate')

    expect(aggregates.length).toBeGreaterThan(0)
    for (const { driver } of aggregates) {
      expect(driver.rntrc).toMatch(/^[0-9]{8,9}$/)
      expect(driver.anttCategory).not.toBe('')
    }
  })

  test('cria cada motorista da semente com o perfil declarado', async () => {
    const stub = createUseCaseStub()

    const result = await seedLocalFleetDrivers({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      useCase: stub.useCase,
    })

    expect(result).toEqual({ created: LOCAL_FLEET_DRIVER_SEEDS.length, skipped: 0 })
    expect(stub.calls.map((call) => call.profile)).toEqual(
      LOCAL_FLEET_DRIVER_SEEDS.map((seed) => seed.profile),
    )
    expect(stub.calls.map((call) => call.driver.taxId)).toEqual(
      LOCAL_FLEET_DRIVER_SEEDS.map((seed) => seed.driver.taxId),
    )
  })

  /** Cadastrar motorista abre usuário no Keycloak: repetir a semente não pode abrir de novo. */
  test('não recria o motorista que já está na frota', async () => {
    const stub = createUseCaseStub(LOCAL_FLEET_DRIVER_SEEDS.map((seed) => seed.driver.taxId))

    const result = await seedLocalFleetDrivers({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      useCase: stub.useCase,
    })

    expect(result).toEqual({ created: 0, skipped: LOCAL_FLEET_DRIVER_SEEDS.length })
    expect(stub.calls).toEqual([])
  })

  test('a semente é restrita a local e test', async () => {
    const { runLocalFleetSeed } = await import('../../src/database/local-fleet-seed.service.js')

    const failure = await runLocalFleetSeed({
      appEnvironment: 'production',
      environment: {},
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('local')
  })
})
