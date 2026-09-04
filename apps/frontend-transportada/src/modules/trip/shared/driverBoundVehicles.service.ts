/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'
import type { FleetDriverVehicleLink } from '@/modules/fleet/shared/fleet.types'

/**
 * Quem escolhe a viagem escolhe **quem leva**, e o veículo do agregado vem junto: ele roda com o
 * próprio caminhão, e obrigar o operador a lembrar qual é a placa dele é pedir para errar.
 *
 * O vínculo é por motorista, então a lista efetiva é a união do que os motoristas trazem com o que
 * o operador acrescentou à mão — e o que veio do motorista **não se tira sem tirar o motorista**,
 * senão a viagem sairia com um agregado sem o veículo dele.
 */
export type DriverVehicleBinding = Readonly<{
  driverId: string
  /** Veículo do próprio motorista (`ownedByDriver`), o que amarra de verdade. */
  ownedVehicleIds: readonly string[]
  /** Todo veículo que o motorista está habilitado a dirigir. */
  vehicleIds: readonly string[]
}>

export function toDriverVehicleBinding(input: {
  readonly driverId: string
  readonly links: readonly FleetDriverVehicleLink[]
}): DriverVehicleBinding {
  return {
    driverId: input.driverId,
    ownedVehicleIds: input.links
      .filter((link) => link.ownedByDriver)
      .map((link) => link.vehicle.id),
    vehicleIds: input.links.map((link) => link.vehicle.id),
  }
}

/**
 * Motorista com **um** veículo habilitado traz esse veículo; com vários, só o que é dele. Com dois
 * veículos da transportadora e nenhum próprio, escolher um seria decidir pelo operador — aí a
 * escolha continua com ele.
 */
export function resolveBoundVehicleIds(input: {
  readonly bindings: readonly DriverVehicleBinding[]
  /**
   * Os veículos que o select oferece — ativos e de tração. O vínculo sobrevive ao veículo sair de
   * circulação: o agregado com o caminhão desativado na ficha ainda tem vínculo, e sem este recorte
   * ele entraria na viagem por baixo do select, que é justamente onde ninguém iria procurá-lo.
   */
  readonly selectableVehicleIds: readonly string[]
  readonly selectedDriverIds: readonly string[]
}): readonly string[] {
  const selected = new Set(input.selectedDriverIds)
  const selectable = new Set(input.selectableVehicleIds)
  const bound: string[] = []

  for (const binding of input.bindings) {
    if (!selected.has(binding.driverId)) continue
    const source =
      binding.ownedVehicleIds.length > 0
        ? binding.ownedVehicleIds
        : binding.vehicleIds.length === 1
          ? binding.vehicleIds
          : []
    for (const vehicleId of source) {
      if (!selectable.has(vehicleId)) continue
      if (!bound.includes(vehicleId)) bound.push(vehicleId)
    }
  }

  return bound
}

export function resolveEffectiveVehicleIds(input: {
  readonly boundVehicleIds: readonly string[]
  readonly manualVehicleIds: readonly string[]
}): readonly string[] {
  const effective = [...input.boundVehicleIds]
  for (const vehicleId of input.manualVehicleIds) {
    if (!effective.includes(vehicleId)) effective.push(vehicleId)
  }
  return effective
}

/**
 * O que a tela devolve ao mudar a seleção vira **só** a parte manual: tirar um veículo amarrado é
 * ignorado de propósito — a tela o recoloca no próximo render, e o caminho de tirá-lo é tirar o
 * motorista dono dele.
 */
export function toManualVehicleIds(input: {
  readonly boundVehicleIds: readonly string[]
  readonly nextVehicleIds: readonly string[]
}): readonly string[] {
  return input.nextVehicleIds.filter((vehicleId) => !input.boundVehicleIds.includes(vehicleId))
}

/**
 * A ficha do veículo na pílula do motorista: marca, modelo, ano e cor. A placa sozinha é o que o
 * sistema usa, mas não é o que quem confere a viagem reconhece — "RTC4H67" não diz se é o truck ou
 * a van, e é essa a pergunta de quem está montando a carga.
 *
 * Campo vazio é **omitido**, nunca vira separador solto: veículo cadastrado só com a marca tem de
 * sair como marca, e não como "MERCEDES-BENZ · · ·". Ano zero é ausência pelo mesmo motivo — a
 * ficha aceita o campo em branco, e "0" na tela seria pior que nada.
 */
export function describeBoundVehicle(input: {
  readonly brand: string
  readonly colorLabel: string
  readonly model: string
  readonly modelYear: number
}): string {
  return [
    input.brand,
    input.model,
    input.modelYear > 0 ? String(input.modelYear) : '',
    input.colorLabel,
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' · ')
}

/** O veículo amarrado, já resolvido: é ele que dá o texto e o ícone da opção do motorista. */
export function resolveBoundVehicleIdsOf(
  binding: DriverVehicleBinding | undefined,
): readonly string[] {
  if (binding === undefined) return []
  if (binding.ownedVehicleIds.length > 0) return binding.ownedVehicleIds
  return binding.vehicleIds.length === 1 ? binding.vehicleIds : []
}

export type BoundVehicleDescription = Readonly<{
  description: string
  icon?: IconName
  plate: string
}>

export type DriverSelectOption = Readonly<{
  description?: string
  icon?: IconName
  label: string
  value: string
}>

/**
 * A opção do motorista carrega o veículo que veio com ele: quem confere a viagem lê "quem leva" e
 * "no quê" numa linha só, e não precisa cruzar duas listas para saber de quem é o caminhão. A
 * primeira linha nomeia (motorista e placa) e a segunda descreve (marca, modelo, ano, cor) — a
 * mesma divisão que a lista de veículos já usa.
 *
 * Sem veículo amarrado sobra só o nome: inventar um traço vazio ali sugeriria que falta um dado que
 * não falta. Com mais de um veículo, os dois aparecem — esconder o segundo mentiria sobre a viagem.
 *
 * ⚠️ **`tripVehicleId` manda sobre o vínculo.** O vínculo é cadastro — o caminhão que o agregado
 * costuma dirigir —, e a viagem é o caminhão que ele vai dirigir **hoje**. Trocar o veículo da
 * viagem e a pílula continuar mostrando o do cadastro faz quem confere ler a placa errada, que é
 * pior do que não mostrar placa nenhuma.
 */
export function buildDriverSelectOption(input: {
  readonly binding: DriverVehicleBinding | undefined
  readonly driver: Readonly<{ id: string; name: string }>
  /** O veículo escolhido para a viagem, quando já há um. Vence o vínculo. */
  readonly tripVehicleId?: string | undefined
  readonly vehicleById: ReadonlyMap<string, BoundVehicleDescription>
}): DriverSelectOption {
  const vehicleIds =
    input.tripVehicleId === undefined || input.tripVehicleId === ''
      ? resolveBoundVehicleIdsOf(input.binding)
      : [input.tripVehicleId]
  const vehicles = vehicleIds
    .map((vehicleId) => input.vehicleById.get(vehicleId))
    .filter((vehicle): vehicle is BoundVehicleDescription => vehicle !== undefined)

  const [first] = vehicles
  if (first === undefined) return { label: input.driver.name, value: input.driver.id }

  const description = vehicles
    .map((vehicle) => vehicle.description)
    .filter((text) => text.length > 0)
    .join(' / ')

  return {
    ...(description === '' ? {} : { description }),
    ...(first.icon === undefined ? {} : { icon: first.icon }),
    label: `${input.driver.name} · ${vehicles.map((vehicle) => vehicle.plate).join(' · ')}`,
    value: input.driver.id,
  }
}
