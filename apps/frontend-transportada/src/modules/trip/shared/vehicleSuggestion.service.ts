/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O agregado costuma ter **um** caminhão, e quem monta a viagem dele repetia a mesma escolha toda
 * vez. A sugestão preenche esse caso e some em todos os outros.
 *
 * Três recusas deliberadas, e cada uma existe para a sugestão nunca discordar do operador:
 *
 * - **Campo já preenchido não é tocado.** Sugerir por cima de escolha feita é desfazer trabalho, e
 *   o operador não teria como saber que foi a tela, não ele. Trocar o motorista depois de escolher
 *   o veículo mantém o veículo — quem quiser o outro, troca no select, que continua editável.
 * - **Dois motoristas não sugerem nada.** A viagem aceita vários, e aí não existe "o veículo dele";
 *   escolher o do primeiro da lista seria inventar critério que ninguém pediu.
 * - **Dois veículos vinculados não sugerem nada.** Com carreta e cavalo na mesma ficha, adivinhar
 *   qual vai hoje é chutar — e o chute erra em silêncio, que é o pior modo de errar aqui.
 */

export type SuggestibleVehicle = Readonly<{ id: string }>

export type DriverVehicleLink = Readonly<{ vehicle: SuggestibleVehicle }>

export type ResolveSuggestedVehicleInput = Readonly<{
  currentVehicleId: string
  driverIds: readonly string[]
  driverVehicles: readonly DriverVehicleLink[]
  /** Os veículos que o select oferece — já filtrados por ativo e por tração. */
  selectableVehicleIds: readonly string[]
}>

const SOLE = 1

export function resolveSuggestedVehicleId(input: ResolveSuggestedVehicleInput): string | null {
  if (input.currentVehicleId.length > 0) return null
  if (input.driverIds.length !== SOLE) return null
  if (input.driverVehicles.length !== SOLE) return null

  const [link] = input.driverVehicles
  if (link === undefined) return null

  /**
   * O vínculo sobrevive ao veículo sair de circulação: motorista com o reboque suspenso na ficha
   * ainda tem um vínculo, e sugerir um id que o select não oferece deixaria o campo mostrando o
   * placeholder com valor preenchido por baixo — o defeito que o catálogo de veículo já teve.
   */
  return input.selectableVehicleIds.includes(link.vehicle.id) ? link.vehicle.id : null
}
