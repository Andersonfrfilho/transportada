import type { MultiSelectOption } from '@/components/ui/multi-select'

/**
 * Spec 081 / ADR-0055: a distribuição deixou de ser uma lista de veículos e passou a ser uma lista
 * de **pares**. O motorista escolhido aqui é o que a viagem criada pelo aceite recebe, e é o que a
 * faz aparecer no PWA de quem dirige — o caminho de leitura do campo parte de `trip_drivers`, e
 * viagem sem linha ali não existe para ele.
 */
export type VehicleDriverPair = Readonly<{
  driverId: string | null
  vehicleId: string
}>

/** O vínculo do cadastro, como a API o publica: só os dois ids. */
export type DriverVehicleLink = Readonly<{
  driverId: string
  vehicleId: string
}>

/**
 * ⚠️ **Vínculo único preenche; vínculo ambíguo não.** Um veículo com dois motoristas, ou um
 * motorista com dois veículos, deixa o outro lado vazio: escolher um deles seria adivinhar qual, e
 * o erro só apareceria com alguém na estrada.
 */
export function resolveSoleDriverOfVehicle(input: {
  readonly links: readonly DriverVehicleLink[]
  readonly vehicleId: string
}): string | null {
  return soleOf(
    input.links.filter((link) => link.vehicleId === input.vehicleId).map((link) => link.driverId),
  )
}

export function resolveSoleVehicleOfDriver(input: {
  readonly driverId: string
  readonly links: readonly DriverVehicleLink[]
}): string | null {
  return soleOf(
    input.links.filter((link) => link.driverId === input.driverId).map((link) => link.vehicleId),
  )
}

function soleOf(values: readonly string[]): string | null {
  const unique = [...new Set(values)]
  return unique.length === 1 ? (unique[0] ?? null) : null
}

/**
 * A escolha de veículos manda na lista de pares: o que sai da seleção sai da lista, e o que entra
 * chega com o motorista do vínculo quando ele é um só.
 *
 * ⚠️ O par que já existia é **preservado inteiro**. Recalcular o motorista a cada mudança da seleção
 * apagaria a escolha manual do operador toda vez que ele acrescentasse outro caminhão.
 */
export function selectVehicles(input: {
  readonly links: readonly DriverVehicleLink[]
  readonly pairs: readonly VehicleDriverPair[]
  readonly vehicleIds: readonly string[]
}): readonly VehicleDriverPair[] {
  const current = new Map(input.pairs.map((pair) => [pair.vehicleId, pair]))

  return input.vehicleIds.map(
    (vehicleId) =>
      current.get(vehicleId) ?? {
        driverId: resolveSoleDriverOfVehicle({ links: input.links, vehicleId }),
        vehicleId,
      },
  )
}

/**
 * A entrada pelo outro lado: escolher o motorista traz o veículo dele. Só o motorista de vínculo
 * único é oferecido (ver `driverOptions`), então aqui o veículo sempre existe — e o par nasce
 * completo, que é o caso do agregado.
 *
 * Desmarcar o motorista **solta o par inteiro**: ele entrou na distribuição por causa da pessoa, e
 * deixar o caminhão para trás poria na rua um veículo que ninguém escolheu.
 *
 * ⚠️ Mas isso alcança **só quem este seletor oferece**. O motorista de dois veículos chega pelo
 * select da linha do caminhão, e mexer aqui não pode derrubá-lo: ele nunca esteve nesta lista, e a
 * escolha que o pôs ali foi outra.
 */
export function selectDrivers(input: {
  readonly driverIds: readonly string[]
  readonly links: readonly DriverVehicleLink[]
  readonly pairs: readonly VehicleDriverPair[]
}): readonly VehicleDriverPair[] {
  const chosen = new Set(input.driverIds)
  const kept = input.pairs.filter(
    (pair) =>
      pair.driverId === null ||
      chosen.has(pair.driverId) ||
      resolveSoleVehicleOfDriver({ driverId: pair.driverId, links: input.links }) === null,
  )
  const paired = new Set(
    kept.map((pair) => pair.driverId).filter((driverId): driverId is string => driverId !== null),
  )

  const chosenPairs = input.driverIds
    .filter((driverId) => !paired.has(driverId))
    .map((driverId) => ({
      driverId,
      vehicleId: resolveSoleVehicleOfDriver({ driverId, links: input.links }),
    }))
    .filter((pair): pair is { driverId: string; vehicleId: string } => pair.vehicleId !== null)

  /**
   * ⚠️ O caminhão dele pode já estar na lista, escolhido pela outra ponta. Ali o par é
   * **substituído**, não descartado: descartar deixava a linha do veículo sem motorista logo depois
   * de o operador ter escolhido a pessoa que o dirige, e nada na tela explicava por quê.
   */
  const byVehicle = new Map(chosenPairs.map((pair) => [pair.vehicleId, pair]))
  const merged = kept.map((pair) => byVehicle.get(pair.vehicleId) ?? pair)
  const held = new Set(kept.map((pair) => pair.vehicleId))

  return [...merged, ...chosenPairs.filter((pair) => !held.has(pair.vehicleId))]
}

/**
 * O motorista de uma linha, escolhido à mão. `null` limpa a linha — o par sem motorista continua
 * legítimo, e é a distribuição da véspera, antes de a escala existir.
 *
 * ⚠️ O mesmo motorista **não fica em duas linhas**: a API recusa (RF-2), e deixar a tela montar o
 * que ela vai recusar é mostrar um botão que só falha depois do clique. Quem tinha o motorista antes
 * o perde.
 */
export function assignDriver(input: {
  readonly driverId: string | null
  readonly pairs: readonly VehicleDriverPair[]
  readonly vehicleId: string
}): readonly VehicleDriverPair[] {
  return input.pairs.map((pair) => {
    if (pair.vehicleId === input.vehicleId)
      return { driverId: input.driverId, vehicleId: pair.vehicleId }
    if (input.driverId !== null && pair.driverId === input.driverId) {
      return { driverId: null, vehicleId: pair.vehicleId }
    }
    return pair
  })
}

/** Os motoristas já escolhidos em outra linha — é o que some do select de cada linha. */
export function driversTakenElsewhere(input: {
  readonly pairs: readonly VehicleDriverPair[]
  readonly vehicleId: string
}): readonly string[] {
  return input.pairs
    .filter((pair) => pair.vehicleId !== input.vehicleId)
    .map((pair) => pair.driverId)
    .filter((driverId): driverId is string => driverId !== null)
}

/**
 * Só o motorista de **vínculo único** entra no seletor por motorista: com dois veículos não há como
 * saber qual ele leva hoje, e escolher um seria pôr um caminhão na rua por dedução. Ele continua
 * alcançável pelo select da linha do veículo.
 */
/** Os motoristas que o seletor por motorista mostra como escolhidos — só os que ele oferece. */
export function selectedDriverIds(input: {
  readonly links: readonly DriverVehicleLink[]
  readonly pairs: readonly VehicleDriverPair[]
}): readonly string[] {
  return input.pairs
    .map((pair) => pair.driverId)
    .filter((driverId): driverId is string => driverId !== null)
    .filter((driverId) => resolveSoleVehicleOfDriver({ driverId, links: input.links }) !== null)
}

export function driverOptions(input: {
  readonly drivers: readonly Readonly<{ id: string; name: string }>[]
  readonly links: readonly DriverVehicleLink[]
}): readonly MultiSelectOption[] {
  return input.drivers
    .filter(
      (driver) => resolveSoleVehicleOfDriver({ driverId: driver.id, links: input.links }) !== null,
    )
    .map((driver) => ({ label: driver.name, value: driver.id }))
}

/** O corpo da rota: `driverId` some quando não há motorista, porque ausente e nulo dizem o mesmo. */
export function toRequestVehicles(
  pairs: readonly VehicleDriverPair[],
): readonly Readonly<{ driverId?: string; vehicleId: string }>[] {
  return pairs.map((pair) =>
    pair.driverId === null
      ? { vehicleId: pair.vehicleId }
      : { driverId: pair.driverId, vehicleId: pair.vehicleId },
  )
}

/** Sem nota selecionada ou sem par montado não há o que pedir — e a API recusaria. */
export function canRequestMultiVehicle(input: {
  readonly documentIds: readonly string[]
  readonly pairs: readonly VehicleDriverPair[]
}): boolean {
  return input.documentIds.length > 0 && input.pairs.length > 0
}
