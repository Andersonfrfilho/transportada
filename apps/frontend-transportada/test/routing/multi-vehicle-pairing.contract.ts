import { describe, expect, test } from 'bun:test'

import {
  assignDriver,
  canRequestMultiVehicle,
  driverOptions,
  driversTakenElsewhere,
  resolveSoleDriverOfVehicle,
  selectedDriverIds,
  resolveSoleVehicleOfDriver,
  selectDrivers,
  selectVehicles,
  toRequestVehicles,
  type DriverVehicleLink,
} from '@/modules/routing/shared/multiVehiclePairing.service'

const TRUCK = 'vehicle-truck'
const VUC = 'vehicle-vuc'
const SPARE = 'vehicle-spare'
const AGGREGATE = 'driver-aggregate'
const STAFF = 'driver-staff'
const SHARED = 'driver-shared'

/** O agregado tem um veículo; o da casa tem dois; o terceiro divide o caminhão com o agregado. */
const LINKS: readonly DriverVehicleLink[] = [
  { driverId: AGGREGATE, vehicleId: TRUCK },
  { driverId: STAFF, vehicleId: VUC },
  { driverId: STAFF, vehicleId: SPARE },
  { driverId: SHARED, vehicleId: TRUCK },
]

describe('o pareamento da distribuição (spec 081)', () => {
  test('o vínculo único preenche os dois lados', () => {
    expect(resolveSoleVehicleOfDriver({ driverId: AGGREGATE, links: LINKS })).toBe(TRUCK)
    expect(resolveSoleDriverOfVehicle({ links: LINKS, vehicleId: VUC })).toBe(STAFF)
  })

  /** Escolher por dedução só se descobre com alguém na estrada. */
  test('o vínculo ambíguo e o vínculo ausente deixam o outro lado vazio', () => {
    expect(resolveSoleVehicleOfDriver({ driverId: STAFF, links: LINKS })).toBeNull()
    expect(resolveSoleDriverOfVehicle({ links: LINKS, vehicleId: TRUCK })).toBeNull()
    expect(
      resolveSoleDriverOfVehicle({ links: LINKS, vehicleId: 'vehicle-sem-vinculo' }),
    ).toBeNull()
  })

  test('escolher o veículo traz o motorista dele quando o vínculo é um só', () => {
    const pairs = selectVehicles({ links: LINKS, pairs: [], vehicleIds: [VUC, TRUCK] })

    expect(pairs).toEqual([
      { driverId: STAFF, vehicleId: VUC },
      { driverId: null, vehicleId: TRUCK },
    ])
  })

  /** Recalcular a cada mudança apagaria a escolha manual toda vez que outro caminhão entrasse. */
  test('acrescentar veículo preserva o par já montado à mão', () => {
    const chosen = assignDriver({
      driverId: SHARED,
      pairs: selectVehicles({ links: LINKS, pairs: [], vehicleIds: [TRUCK] }),
      vehicleId: TRUCK,
    })

    const grown = selectVehicles({ links: LINKS, pairs: chosen, vehicleIds: [TRUCK, VUC] })

    expect(grown).toEqual([
      { driverId: SHARED, vehicleId: TRUCK },
      { driverId: STAFF, vehicleId: VUC },
    ])
  })

  test('tirar o veículo da seleção tira o par inteiro', () => {
    const pairs = selectVehicles({ links: LINKS, pairs: [], vehicleIds: [TRUCK, VUC] })

    expect(selectVehicles({ links: LINKS, pairs, vehicleIds: [VUC] })).toEqual([
      { driverId: STAFF, vehicleId: VUC },
    ])
  })

  /** É o caso do agregado: escolher a pessoa já põe o caminhão dela na distribuição. */
  test('escolher o motorista traz o veículo dele, e desmarcá-lo solta o par', () => {
    const pairs = selectDrivers({ driverIds: [AGGREGATE], links: LINKS, pairs: [] })
    expect(pairs).toEqual([{ driverId: AGGREGATE, vehicleId: TRUCK }])

    expect(selectDrivers({ driverIds: [], links: LINKS, pairs })).toEqual([])
  })

  /** O par sem motorista não entrou pela pessoa: ele fica onde está. */
  test('desmarcar motorista não derruba o par escolhido pelo veículo', () => {
    const pairs = [
      { driverId: null, vehicleId: VUC },
      { driverId: AGGREGATE, vehicleId: TRUCK },
    ]

    expect(selectDrivers({ driverIds: [], links: LINKS, pairs })).toEqual([
      { driverId: null, vehicleId: VUC },
    ])
  })

  /**
   * ⚠️ Descartar aqui deixava a linha do veículo sem motorista logo depois de o operador ter
   * escolhido a pessoa que o dirige, e nada na tela explicava por quê.
   */
  test('escolher o motorista preenche o veículo que já estava na lista', () => {
    const pairs = selectVehicles({ links: LINKS, pairs: [], vehicleIds: [TRUCK, VUC] })
    expect(pairs).toEqual([
      { driverId: null, vehicleId: TRUCK },
      { driverId: STAFF, vehicleId: VUC },
    ])

    expect(selectDrivers({ driverIds: [AGGREGATE], links: LINKS, pairs })).toEqual([
      { driverId: AGGREGATE, vehicleId: TRUCK },
      { driverId: STAFF, vehicleId: VUC },
    ])
  })

  /**
   * ⚠️ O motorista de dois veículos chega pelo select da linha, não por este seletor — mexer aqui
   * não pode derrubá-lo, porque a escolha que o pôs ali foi outra.
   */
  test('desmarcar motorista não alcança quem o seletor não oferece', () => {
    const pairs = [
      { driverId: STAFF, vehicleId: VUC },
      { driverId: AGGREGATE, vehicleId: TRUCK },
    ]

    expect(selectDrivers({ driverIds: [], links: LINKS, pairs })).toEqual([
      { driverId: STAFF, vehicleId: VUC },
    ])
    expect(selectedDriverIds({ links: LINKS, pairs })).toEqual([AGGREGATE])
  })

  /**
   * RF-2: a API recusa o mesmo motorista em dois pares, e deixar a tela montar o que ela vai recusar
   * é mostrar um botão que só falha depois do clique.
   */
  test('o mesmo motorista não fica em duas linhas', () => {
    const pairs = assignDriver({
      driverId: STAFF,
      pairs: selectVehicles({ links: LINKS, pairs: [], vehicleIds: [VUC, SPARE] }),
      vehicleId: SPARE,
    })

    expect(pairs).toEqual([
      { driverId: null, vehicleId: VUC },
      { driverId: STAFF, vehicleId: SPARE },
    ])
    expect(driversTakenElsewhere({ pairs, vehicleId: VUC })).toEqual([STAFF])
  })

  test('limpar o motorista da linha deixa o par sem motorista, que é legítimo', () => {
    const pairs = assignDriver({
      driverId: null,
      pairs: [{ driverId: STAFF, vehicleId: VUC }],
      vehicleId: VUC,
    })

    expect(pairs).toEqual([{ driverId: null, vehicleId: VUC }])
    expect(canRequestMultiVehicle({ documentIds: ['nota'], pairs })).toBe(true)
  })

  /** Com dois veículos não há como saber qual ele leva hoje — ele entra pelo select da linha. */
  test('só o motorista de vínculo único é oferecido no seletor por motorista', () => {
    const options = driverOptions({
      drivers: [
        { id: AGGREGATE, name: 'Agregado' },
        { id: STAFF, name: 'Da casa' },
        { id: 'driver-sem-veiculo', name: 'Sem veículo' },
      ],
      links: LINKS,
    })

    expect(options).toEqual([{ label: 'Agregado', value: AGGREGATE }])
  })

  /** Ausente e nulo dizem a mesma coisa à API, e o schema dela não aceita `null`. */
  test('o corpo omite o motorista quando não há nenhum', () => {
    expect(
      toRequestVehicles([
        { driverId: AGGREGATE, vehicleId: TRUCK },
        { driverId: null, vehicleId: VUC },
      ]),
    ).toEqual([{ driverId: AGGREGATE, vehicleId: TRUCK }, { vehicleId: VUC }])
  })

  test('sem nota ou sem par não há o que pedir', () => {
    expect(
      canRequestMultiVehicle({ documentIds: [], pairs: [{ driverId: null, vehicleId: TRUCK }] }),
    ).toBe(false)
    expect(canRequestMultiVehicle({ documentIds: ['nota'], pairs: [] })).toBe(false)
  })
})
