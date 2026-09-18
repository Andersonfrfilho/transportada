/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule, type TripStatusContract } from './trip.fixture'

/**
 * Os portões da tela têm de concordar com a máquina do backend, e essa concordância **não é
 * verificável por nenhum outro teste desta app**: os contratos daqui leem texto de fonte ou
 * exercitam serviço puro, e nenhum deles renderiza. Um botão oferecido no estado errado passa
 * por toda a suíte e só aparece como `409` na mão do separador.
 *
 * A tabela abaixo é transcrita de `checkTripAcceptsDocumentWork`
 * (`api-transportada/src/trips/domain/trip-state.policy.ts`), que divide o trabalho em dois:
 *
 * - **barracão** (`separate`/`load`): recusa `cancelled`, `completed`, todo estado despachado, e
 *   também `draft` — sem roteiro planejado sai `TRIP_ROUTE_NOT_PLANNED`;
 * - **rua** (`return`/`deliver`): exige `isTripDispatched`. Spec 156 T8b, ADR-0067: o gate de rua
 *   deixou de viver no cliente — `field-delivery`/`field-return` (`trip.report-on-behalf`) só
 *   aparecem por `allowedActions`, resolvidos pelo servidor. Este arquivo não os afirma mais; o
 *   contrato de `allowedActions` mora em `test/trip/field-action-capabilities.contract.ts`.
 *
 * Mais o portão de vínculo (`checkTripAcceptsLinkage`, T013), que é um terceiro: vale até
 * `dispatched`, exclusive.
 */
const GATES_BY_STATUS: Readonly<
  Record<TripStatusContract, { editable: boolean; separateOrLoad: boolean }>
> = {
  cancelled: { editable: false, separateOrLoad: false },
  completed: { editable: false, separateOrLoad: false },
  dispatched: { editable: false, separateOrLoad: false },
  draft: { editable: true, separateOrLoad: false },
  in_transit: { editable: false, separateOrLoad: false },
  loading: { editable: true, separateOrLoad: true },
  on_delivery_route: { editable: false, separateOrLoad: false },
  route_planned: { editable: true, separateOrLoad: true },
  separating: { editable: true, separateOrLoad: true },
}

type TripStatusModule = {
  readonly canSeparateOrLoadDocuments: (status: TripStatusContract) => boolean
  readonly isTripDispatched: (status: TripStatusContract) => boolean
  readonly isTripEditable: (status: TripStatusContract) => boolean
}

describe('trip state gates mirror the backend transition policy', () => {
  test('every trip status opens exactly the gates the domain opens', async () => {
    const { canSeparateOrLoadDocuments, isTripEditable } = await loadFutureModule<TripStatusModule>(
      '../../src/modules/trip/shared/tripStatus.service',
    )

    const actual = Object.fromEntries(
      Object.keys(GATES_BY_STATUS).map((status) => [
        status,
        {
          editable: isTripEditable(status as TripStatusContract),
          separateOrLoad: canSeparateOrLoadDocuments(status as TripStatusContract),
        },
      ]),
    )

    expect(actual).toEqual(GATES_BY_STATUS)
  })

  /**
   * Spec 156 T8b: `canDeliverDocuments`/`canReturnDocuments` saíram do módulo — nenhuma das duas
   * funções deve reaparecer aqui. Reintroduzi-las seria a mesma regressão que este arquivo já
   * impediu uma vez (spec 079): uma cópia da máquina de estados vivendo fora do servidor.
   */
  test('canDeliverDocuments and canReturnDocuments no longer exist', async () => {
    const module = await loadFutureModule<Record<string, unknown>>(
      '../../src/modules/trip/shared/tripStatus.service',
    )

    expect(module.canDeliverDocuments).toBeUndefined()
    expect(module.canReturnDocuments).toBeUndefined()
  })
})
