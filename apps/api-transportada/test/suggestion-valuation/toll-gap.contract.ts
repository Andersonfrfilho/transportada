/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { readSuggestionValuation } from '../../src/routing/application/read-suggestion-valuation.use-case.js'
import type { SuggestionValuationPort } from '../../src/routing/application/suggestion-valuation.port.js'
import { buildValuationFromContext } from '../../src/trips/application/read-trip-valuation.use-case.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const SUGGESTION_ID = '00000000-0000-4000-8000-000000000902'
const VEHICLE_A = '00000000-0000-4000-8000-0000000000a1'

const REPOSITORY = {
  findApplicableRule: async () => null,
  /** Não é usado: a conta parte de contexto pronto, e é isso que o teste isola. */
  readContext: async () => null,
}

describe('pedágio na sugestão (spec 101 D2)', () => {
  /**
   * ⚠️ O pedágio precisa dos `nodeIds` que o OSRM devolve em `annotations=nodes`, e a sugestão
   * **não os persiste**. Sem eles não há como saber que praças o trajeto atravessa.
   *
   * Zero diria que o trajeto não tem pedágio — e numa distribuição pelo interior de SP ele costuma
   * ser a segunda maior parcela. Um total sem ele parece uma margem melhor do que é.
   */
  it('sem projeção de pedágio a parcela é lacuna nomeada, nunca zero calado', async () => {
    const valuation = await buildValuationFromContext({
      companyId: COMPANY_ID,
      context: {
        distanceMeters: 100_000,
        documents: [],
        fuelPricePerLiter: '6.0000',
        toll: null,
        tollUnavailableReason: 'suggestion',
        vehicle: { kilometersPerLiter: '4.0000', otherCostsPerKilometer: '0.3000' },
      },
      repository: REPOSITORY,
    })

    const toll = valuation.costParcels.find((parcel) => parcel.kind === 'toll')

    expect(toll?.gap).toBe(VALUATION_GAPS.tollNotAvailableInSuggestion)
    expect(toll?.source).toBe('missing')
    expect(toll?.amount).toBe('0.0000')
  })

  /**
   * ⚠️ A viagem de verdade continua dizendo "ninguém lançou": ali o operador **pode** lançar, e
   * trocar o texto mandaria ele procurar um botão que não existe. As duas ausências são diferentes.
   */
  it('sem a marca da sugestão, a ausência continua sendo falta de lançamento', async () => {
    const valuation = await buildValuationFromContext({
      companyId: COMPANY_ID,
      context: {
        distanceMeters: 100_000,
        documents: [],
        fuelPricePerLiter: '6.0000',
        vehicle: { kilometersPerLiter: '4.0000', otherCostsPerKilometer: '0.3000' },
      },
      repository: REPOSITORY,
    })

    expect(valuation.costParcels.find((parcel) => parcel.kind === 'toll')?.gap).toBe(
      VALUATION_GAPS.notRecorded,
    )
  })

  /** O caminho da sugestão marca o contexto — senão a lacuna nova nunca chegaria à tela. */
  it('o use case da sugestão marca o contexto como sem pedágio disponível', async () => {
    let seen: unknown = 'nao chamado'
    const repository: SuggestionValuationPort = {
      readGroups: async () => [
        {
          documentIds: [],
          driverId: null,
          estimatedArrivalByAddressKey: new Map(),
          orderedAddressKeys: [],
          vehicleId: VEHICLE_A,
        },
      ],
      readPreviewContext: async () => ({
        distanceMeters: null,
        documents: [],
        fuelPricePerLiter: '6.0000',
        vehicle: { kilometersPerLiter: '4.0000', otherCostsPerKilometer: '0.3000' },
      }),
      readSuggestionStatus: async () => 'ready',
      readVehicleRoads: async () => [
        {
          stops: [{ distanceFromPreviousMeters: 10_000, durationFromPreviousSeconds: 600 }],
          vehicleId: VEHICLE_A,
        },
      ],
      resolveValuation: async (input) => {
        seen = input.context.tollUnavailableReason
        return {
          costParcels: [],
          hasGaps: false,
          marginPercentage: null,
          revenueLines: [],
          revenueSource: 'estimated',
          totalCost: '0.0000',
          totalMargin: '0.0000',
          totalRevenue: '0.0000',
        }
      },
    }

    await readSuggestionValuation({
      companyId: COMPANY_ID,
      repository,
      suggestionId: SUGGESTION_ID,
    })

    expect(seen).toBe('suggestion')
  })
})
