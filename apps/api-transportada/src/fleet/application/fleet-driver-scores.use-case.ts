/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0069 §7, spec 159 RF10 (T8): a nota do motorista na frota — ao lado de cada item da listagem
 * (uma leitura de nota por página, nunca uma por motorista) e na ficha, com as penalidades vigentes.
 */
import { FleetDriverNotFoundError } from '../domain/fleet.error.js'
import type { DriverScoreResult } from '../domain/driver-score.policy.js'
import type { DriverScorePort } from './driver-score.port.js'
import type { ListFleetDriversInput } from './fleet-drivers.use-case.js'
import type {
  FleetCompanyContext,
  FleetDriver,
  FleetDriverPage,
  FleetDriverRepositoryPort,
} from './fleet.port.js'

export type ScoredFleetDriver = FleetDriver & { readonly score: number | null }

export type ScoredFleetDriverPage = {
  readonly items: readonly ScoredFleetDriver[]
  readonly nextCursor: string | null
}

export type ReadFleetDriverScoreInput = {
  readonly context: FleetCompanyContext
  readonly driverId: string
}

export type FleetDriverScoresUseCase = {
  list(input: ListFleetDriversInput): Promise<ScoredFleetDriverPage>
  read(input: ReadFleetDriverScoreInput): Promise<DriverScoreResult>
}

export function createFleetDriverScoresUseCase(dependencies: {
  /** O relógio da janela de 90 dias — injetado para o contrato fixar o instante. */
  readonly clock: () => Date
  readonly drivers: Pick<FleetDriverRepositoryPort, 'findById'>
  readonly listDrivers: (input: ListFleetDriversInput) => Promise<FleetDriverPage>
  readonly scores: DriverScorePort
}): FleetDriverScoresUseCase {
  const { clock, drivers, scores } = dependencies

  return {
    async list(input) {
      const page = await dependencies.listDrivers(input)
      const scoresByDriver = await scores.readScores({
        companyId: input.context.companyId,
        driverIds: page.items.map((driver) => driver.id),
        now: clock(),
      })

      return {
        items: page.items.map((driver) => ({
          ...driver,
          score: scoresByDriver.get(driver.id) ?? null,
        })),
        nextCursor: page.nextCursor,
      }
    },

    /** Motorista de outra empresa ou inexistente é o mesmo 404 — a ficha nunca confirma um id alheio. */
    async read(input) {
      const companyId = input.context.companyId
      const driver = await drivers.findById({ companyId, driverId: input.driverId })
      if (driver === null) throw new FleetDriverNotFoundError()

      return scores.readPenalties({ companyId, driverId: input.driverId, now: clock() })
    },
  }
}
