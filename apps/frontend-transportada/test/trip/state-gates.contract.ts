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
 * - **rua** (`return`/`deliver`): exige `isTripDispatched`, e `completed` já saiu antes por ser
 *   terminal. Ou seja, devolver é o **inverso** de separar, não uma variação dele.
 *
 * Mais o portão de vínculo (`checkTripAcceptsLinkage`, T013), que é um terceiro: vale até
 * `dispatched`, exclusive.
 */
const GATES_BY_STATUS: Readonly<
  Record<TripStatusContract, { editable: boolean; return: boolean; separateOrLoad: boolean }>
> = {
  cancelled: { editable: false, return: false, separateOrLoad: false },
  completed: { editable: false, return: false, separateOrLoad: false },
  dispatched: { editable: false, return: true, separateOrLoad: false },
  draft: { editable: true, return: false, separateOrLoad: false },
  in_transit: { editable: false, return: true, separateOrLoad: false },
  loading: { editable: true, return: false, separateOrLoad: true },
  route_planned: { editable: true, return: false, separateOrLoad: true },
  separating: { editable: true, return: false, separateOrLoad: true },
}

type TripStatusModule = {
  readonly canReturnDocuments: (status: TripStatusContract) => boolean
  readonly canSeparateOrLoadDocuments: (status: TripStatusContract) => boolean
  readonly isTripDispatched: (status: TripStatusContract) => boolean
  readonly isTripEditable: (status: TripStatusContract) => boolean
}

describe('trip state gates mirror the backend transition policy', () => {
  test('every trip status opens exactly the gates the domain opens', async () => {
    const { canReturnDocuments, canSeparateOrLoadDocuments, isTripEditable } =
      await loadFutureModule<TripStatusModule>('../../src/modules/trip/shared/tripStatus.service')

    const actual = Object.fromEntries(
      Object.keys(GATES_BY_STATUS).map((status) => [
        status,
        {
          editable: isTripEditable(status as TripStatusContract),
          return: canReturnDocuments(status as TripStatusContract),
          separateOrLoad: canSeparateOrLoadDocuments(status as TripStatusContract),
        },
      ]),
    )

    expect(actual).toEqual(GATES_BY_STATUS)
  })

  /**
   * ⚠️ **A mesma regressão, agora em "Marcar entregue"** (spec 079). Entregar teve rota própria fora
   * da máquina de estados até 02/09/2026: ela aceitava qualquer estado, e por isso o botão podia
   * usar `isTripEditable` sem ninguém notar. Com a rota passando pela política, entregar herdou o
   * portão de devolver — `checkTripAcceptsDocumentWork` exige viagem despachada para os dois —, e
   * `isTripEditable` passou a oferecer o botão exatamente onde o backend responde 409.
   *
   * O gate de entregar **é** o de devolver. Se algum dia deixarem de ser o mesmo, é aqui que a
   * separação se declara — não numa condição solta no JSX.
   */
  test('delivering opens exactly where returning opens', async () => {
    const { canDeliverDocuments, canReturnDocuments } = await loadFutureModule<
      TripStatusModule & { readonly canDeliverDocuments: (status: TripStatusContract) => boolean }
    >('../../src/modules/trip/shared/tripStatus.service')

    for (const status of Object.keys(GATES_BY_STATUS)) {
      expect(canDeliverDocuments(status as TripStatusContract)).toBe(
        canReturnDocuments(status as TripStatusContract),
      )
    }
  })

  /**
   * A regressão concreta que este arquivo nasceu para impedir: devolver estava preso a
   * `isTripEditable`, ou seja, oferecido só **antes** do despacho — exatamente quando o backend o
   * recusa, e escondido exatamente quando ele funciona.
   */
  test('returning and separating never open at the same time', async () => {
    const { canReturnDocuments, canSeparateOrLoadDocuments } =
      await loadFutureModule<TripStatusModule>('../../src/modules/trip/shared/tripStatus.service')

    for (const status of Object.keys(GATES_BY_STATUS) as TripStatusContract[]) {
      expect(canReturnDocuments(status) && canSeparateOrLoadDocuments(status)).toBe(false)
    }
  })

  test('the linkage gate closes from dispatched onward, and returning opens there', async () => {
    const { canReturnDocuments, isTripEditable } = await loadFutureModule<TripStatusModule>(
      '../../src/modules/trip/shared/tripStatus.service',
    )

    // As duas metades da D2: a carga saiu, o vínculo sela e o trabalho passa a ser de rua.
    expect(isTripEditable('dispatched')).toBe(false)
    expect(canReturnDocuments('dispatched')).toBe(true)
    expect(isTripEditable('route_planned')).toBe(true)
    expect(canReturnDocuments('route_planned')).toBe(false)
  })
})
