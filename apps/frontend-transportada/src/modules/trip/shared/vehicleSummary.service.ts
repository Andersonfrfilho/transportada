/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O detalhe da viagem imprimia o **UUID** do veículo — `616c5834-a0ef-…`. Para quem opera, isso não
 * identifica nada: a placa é o que se lê no pátio, e marca, modelo, ano e cor são o que confirmam
 * que é o caminhão certo antes de despachar.
 *
 * Não reusa `buildVehicleOptionDescription` da frota porque as duas linhas respondem perguntas
 * diferentes: lá é **escolher entre veículos** (e por isso leva a propriedade — próprio ou
 * agregado), aqui é **reconhecer um só**, e o ano entra no lugar da propriedade. Compartilhar a
 * função obrigaria uma delas a carregar campo que não usa.
 */

export type VehicleSummaryInput = Readonly<{
  brand: string
  colorLabel: string
  model: string
  modelYear: string
  plate: string
}>

/**
 * Parte vazia sai fora em vez de virar separador solto: veículo sem ano cadastrado mostraria
 * `FFV2D95 · Renault Master ·  · Branca`, e ninguém saberia o que faltou.
 */
export function describeTripVehicle(input: VehicleSummaryInput): string {
  const name = [input.brand, input.model]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ')

  return [input.plate, name, input.modelYear, input.colorLabel]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' · ')
}
