/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const ARCHIVE_DECISION = 'docs/adr/0066-a-diaria-paga-o-motorista-e-a-zona-fica-de-arquivo.md'

/**
 * ⚠️ Código sem chamador não se defende sozinho. Quem varre o repositório atrás de órfão apaga
 * primeiro e lê a decisão depois — e a próxima revisão volta a apontar os mesmos símbolos como
 * lixo novo. O par aqui é o guarda: apagar o símbolo **ou** o parágrafo da ADR derruba a suíte.
 */
const KEPT_WITHOUT_CONSUMER = [
  {
    name: 'resolveTripDriverZone',
    source: 'apps/api-transportada/src/trips/domain/trip-driver-zone.policy.ts',
  },
  {
    name: 'chooseTiedZone',
    source: 'apps/api-transportada/src/trips/domain/trip-driver-tie.policy.ts',
  },
  {
    name: 'resolveVehicleFreightClass',
    source: 'apps/api-transportada/src/shared/vehicle-type.constant.ts',
  },
  {
    name: 'SALARIED_CREW_MEMBER',
    source: 'apps/api-transportada/src/trips/domain/trip-valuation.policy.ts',
  },
] as const

describe('code kept without a production consumer', () => {
  test('the archive decision names every symbol that survives without a caller', async () => {
    const decision = await Bun.file(new URL(ARCHIVE_DECISION, REPOSITORY_ROOT)).text()

    for (const kept of KEPT_WITHOUT_CONSUMER) expect(decision).toContain(kept.name)
  })

  test('every symbol the archive decision keeps is still where it says it is', async () => {
    for (const kept of KEPT_WITHOUT_CONSUMER) {
      const source = await Bun.file(new URL(kept.source, REPOSITORY_ROOT)).text()
      expect(source).toContain(kept.name)
    }
  })
})
