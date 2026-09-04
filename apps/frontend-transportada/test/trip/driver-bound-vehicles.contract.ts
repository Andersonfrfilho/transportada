/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildDriverSelectOption,
  describeBoundVehicle,
  resolveBoundVehicleIds,
  type BoundVehicleDescription,
  type DriverVehicleBinding,
} from '../../src/modules/trip/shared/driverBoundVehicles.service'

const DRIVER = { id: 'driver-1', name: 'Adalberto Rocha' }
const OWNED = 'vehicle-owned'
const OTHER = 'vehicle-other'

const VEHICLES: ReadonlyMap<string, BoundVehicleDescription> = new Map([
  [OWNED, { description: 'IVECO · DAILY 35-150 · 2023 · Branca', plate: 'RTC4H67' }],
  [OTHER, { description: 'MERCEDES-BENZ · ATEGO 2426 · 2022 · Branca', plate: 'RTA2F45' }],
])

const BINDING: DriverVehicleBinding = {
  driverId: DRIVER.id,
  ownedVehicleIds: [OWNED],
  vehicleIds: [OWNED],
}

describe('driver bound vehicles contract', () => {
  test('brings the aggregate own vehicle along with him', () => {
    expect(
      resolveBoundVehicleIds({
        bindings: [BINDING],
        selectableVehicleIds: [OWNED, OTHER],
        selectedDriverIds: [DRIVER.id],
      }),
    ).toEqual([OWNED])
    expect(
      buildDriverSelectOption({ binding: BINDING, driver: DRIVER, vehicleById: VEHICLES }).label,
    ).toBe('Adalberto Rocha · RTC4H67')
  })

  /**
   * ⚠️ O vínculo sobrevive ao veículo sair de circulação. Sem este recorte, o agregado com o
   * caminhão desativado na ficha o colocava na viagem **por baixo do select** — que é justamente
   * onde ninguém iria procurá-lo para tirar.
   */
  test('leaves out a linked vehicle the select no longer offers', () => {
    expect(
      resolveBoundVehicleIds({
        bindings: [BINDING],
        selectableVehicleIds: [OTHER],
        selectedDriverIds: [DRIVER.id],
      }),
    ).toEqual([])
  })

  /**
   * ⚠️ O vínculo é **cadastro** — o caminhão que o agregado costuma dirigir. A viagem é o caminhão
   * de hoje. Trocado o veículo, a pílula que continuasse mostrando o do cadastro faria quem confere
   * a viagem ler a placa errada, que é pior do que não mostrar placa nenhuma.
   */
  test('lets the vehicle chosen for the trip win over the registered one', () => {
    const option = buildDriverSelectOption({
      binding: BINDING,
      driver: DRIVER,
      tripVehicleId: OTHER,
      vehicleById: VEHICLES,
    })

    expect(option.label).toBe('Adalberto Rocha · RTA2F45')
    expect(option.description).toBe('MERCEDES-BENZ · ATEGO 2426 · 2022 · Branca')
  })

  /** Sem veículo escolhido ainda, o do cadastro segue valendo: é a dica que ajuda a escolher. */
  test('falls back to the registered vehicle while the trip has none', () => {
    for (const tripVehicleId of [undefined, '']) {
      expect(
        buildDriverSelectOption({
          binding: BINDING,
          driver: DRIVER,
          tripVehicleId,
          vehicleById: VEHICLES,
        }).label,
      ).toBe('Adalberto Rocha · RTC4H67')
    }
  })

  /**
   * ⚠️ O veículo da viagem vale para quem **está** na viagem. Aplicado à lista inteira, ele dava
   * placa a motorista sem vínculo nenhum — "Ivanilde · RTA2F45" quando ela não dirige coisa
   * alguma. Quem ainda não foi escolhido continua mostrando o do cadastro dele, que é a dica.
   */
  test('never lends the trip vehicle to a driver who has none of his own', () => {
    const option = buildDriverSelectOption({
      binding: undefined,
      driver: { id: 'driver-2', name: 'Ivanilde Souza Barreto' },
      vehicleById: VEHICLES,
    })

    expect(option.label).toBe('Ivanilde Souza Barreto')
    expect(option.description).toBeUndefined()
  })

  /** Funcionário sem vínculo é só o nome: um traço vazio sugeriria um dado que não falta. */
  test('leaves a driver without a linked vehicle as the bare name', () => {
    expect(
      buildDriverSelectOption({ binding: undefined, driver: DRIVER, vehicleById: VEHICLES }).label,
    ).toBe('Adalberto Rocha')
  })

  /** Campo vazio some em vez de virar separador solto — ano zero é ausência, não "0". */
  test('drops the empty parts instead of printing a dangling separator', () => {
    expect(describeBoundVehicle({ brand: 'RANDON', colorLabel: '', model: '', modelYear: 0 })).toBe(
      'RANDON',
    )
  })
})

describe('trip route assembly pairing contract', () => {
  /**
   * ⚠️ Esta tela é a da **sugestão**, e só. O par de botões manual/recomendado transferia ao
   * operador uma decisão que a tela já tinha tomado ao ser aberta — e o caminho manual dela punha
   * todos os motoristas no primeiro veículo, com a funcionária de carona na van do agregado.
   */
  test('validates only what the suggestion needs: invoices, drivers and vehicles', async () => {
    const { validateRouteAssembly } = await import(
      '../../src/modules/trip/shared/tripRouteAssembly.service'
    )
    const selection = { alreadyOnTrip: [], eligible: [{ id: 'doc-1' }] } as never

    expect(validateRouteAssembly({ draft: { driverIds: [], vehicleIds: [] }, selection })).toEqual([
      'driverRequired',
      'vehicleRequired',
    ])

    /** Vários veículos são o caso normal aqui: é o roteirizador que reparte a carga entre eles. */
    expect(
      validateRouteAssembly({
        draft: { driverIds: ['driver-1'], vehicleIds: ['v1', 'v2'] },
        selection,
      }),
    ).toEqual([])
  })

  /**
   * ⚠️ A rota multi-veículo aceita **pares** (spec 081), e o cliente mandava só `vehicleIds`. A
   * viagem nascia sem motorista e não aparecia no aplicativo de quem dirige.
   */
  test('sends the driver of each vehicle, not a bare list of vehicles', async () => {
    const { toRequestVehicles, resolveSoleDriverOfVehicle } = await import(
      '../../src/modules/routing/shared/multiVehiclePairing.service'
    )
    const links = [
      { driverId: 'aggregate', vehicleId: 'own-van' },
      { driverId: 'employee', vehicleId: 'company-van' },
    ]

    expect(
      toRequestVehicles(
        ['own-van', 'company-van'].map((vehicleId) => ({
          driverId: resolveSoleDriverOfVehicle({ links, vehicleId }),
          vehicleId,
        })),
      ),
    ).toEqual([
      { driverId: 'aggregate', vehicleId: 'own-van' },
      { driverId: 'employee', vehicleId: 'company-van' },
    ])
  })

  /** Veículo com dois motoristas no cadastro não pareia sozinho: escolher um seria adivinhar. */
  test('leaves an ambiguous vehicle without a driver instead of guessing', async () => {
    const { toRequestVehicles, resolveSoleDriverOfVehicle } = await import(
      '../../src/modules/routing/shared/multiVehiclePairing.service'
    )
    const links = [
      { driverId: 'driver-a', vehicleId: 'shared-van' },
      { driverId: 'driver-b', vehicleId: 'shared-van' },
    ]

    expect(
      toRequestVehicles([
        {
          driverId: resolveSoleDriverOfVehicle({ links, vehicleId: 'shared-van' }),
          vehicleId: 'shared-van',
        },
      ]),
    ).toEqual([{ vehicleId: 'shared-van' }])
  })
})

describe('multi vehicle suggestion status contract', () => {
  /**
   * ⚠️ Cópia por valor de `ROUTE_SUGGESTION_STATUSES` (ADR-0044 §5). Faltar um valor não degrada:
   * o validador **lança**, e foi assim que a criação morreu no próprio `202` — a sugestão nasce
   * `queued`, que o vocabulário do cliente não conhecia, e nada chegava a esperar o solver.
   */
  test('knows every status the API can answer with', async () => {
    const { multiVehicleSuggestionFromApi } = await import(
      '../../src/modules/trip/shared/multiVehicleSuggestion.validation'
    )

    for (const status of [
      'queued',
      'running',
      'ready',
      'accepted',
      'rejected',
      'failed',
      'stale',
    ]) {
      expect(multiVehicleSuggestionFromApi({ id: 'suggestion-1', status }).status).toBe(
        status as never,
      )
    }
  })

  test('refuses a status the API never answers with', async () => {
    const { multiVehicleSuggestionFromApi } = await import(
      '../../src/modules/trip/shared/multiVehicleSuggestion.validation'
    )

    expect(() => multiVehicleSuggestionFromApi({ id: 'suggestion-1', status: 'pending' })).toThrow(
      'TRIP_RESPONSE_INVALID',
    )
  })
})

describe('trip route assembly outcome contract', () => {
  const APPLICATION_ROOT = new URL('../..', import.meta.url)

  function readApplicationFile(filePath: string): Promise<string> {
    return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
  }

  /**
   * ⚠️ O modal ficava aberto depois de criar. O formulário era limpo no sucesso, e com ele voltavam
   * os três avisos de campo vazio — a mensagem "1 viagem criada" aparecia cercada de "selecione ao
   * menos um motorista", que lê como se algo tivesse falhado logo depois de dar certo.
   */
  test('closes the dialog and reports the trips outside it', async () => {
    const [hook, panel, page] = await Promise.all([
      readApplicationFile('src/modules/trip/hooks/useTripRouteAssembly.hook.ts'),
      readApplicationFile('src/modules/trip/components/TripRouteAssemblyPanel.component.tsx'),
      readApplicationFile('src/modules/trip/pages/TripWorkspace.page.tsx'),
    ])

    expect(hook).toContain('setIsOpen(false)')
    expect(hook).toContain('input.onCreated(result.trips)')
    /** O resultado sai do modal que o produziu e passa a viver na lista. */
    expect(panel).not.toContain('assembly.outcome')
    expect(page).toContain('routeAssembly.outcomeAutomatic')
  })

  /**
   * Uma viagem abre nela — quem montou quer conferir o roteiro. Várias ficam na lista: abrir a
   * primeira esconderia as outras que o mesmo clique acabou de criar.
   */
  test('opens the single created trip and stays on the list for many', async () => {
    const page = await readApplicationFile('src/modules/trip/pages/TripWorkspace.page.tsx')

    expect(page).toContain('trips.length === 1')
    expect(page).toContain('navigateToTrip({ navigator: createBrowserWorkspaceNavigator()')
  })
})
