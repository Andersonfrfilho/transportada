/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O código é estável e serve à máquina; quem recebe o aviso precisa da frase. O mapa cobre o que a
 * emissão automática realmente recusa — e **o desconhecido sai como o próprio código**, nunca como
 * "erro ao emitir": um código no aviso ainda é pesquisável, um genérico não é nada.
 */
const REFUSAL_REASONS: Readonly<Record<string, string>> = {
  MDFE_FISCAL_SETTINGS_MISSING: 'a empresa não tem os dados fiscais do MDF-e configurados',
  MDFE_MANIFEST_CREW_REQUIRED: 'a viagem está sem condutor',
  MDFE_MANIFEST_DESTINATION_STATE_REQUIRED: 'não foi possível decidir a UF de descarga',
  MDFE_MANIFEST_DOCUMENTS_BLOCKED: 'há nota bloqueada na viagem',
  MDFE_MANIFEST_DRIVER_NOT_AVAILABLE: 'o condutor da viagem está indisponível',
  MDFE_MANIFEST_DRIVER_NOT_FOUND: 'o condutor da viagem não está cadastrado',
  MDFE_MANIFEST_EMPTY_SELECTION: 'não há documento a manifestar',
  MDFE_MANIFEST_MULTIPLE_ORIGIN_STATES: 'a carga tem mais de uma UF de origem',
  MDFE_MANIFEST_TOO_MANY_LOADING_CITIES: 'a carga tem municípios de carregamento demais',
  MDFE_MANIFEST_VEHICLE_NOT_AVAILABLE: 'o veículo da viagem está indisponível',
  MDFE_MANIFEST_VEHICLE_NOT_FOUND: 'o veículo da viagem não está cadastrado',
  TRIP_MANIFEST_DISCHARGE_CITIES_OVER_LIMIT:
    'a viagem descarrega em mais municípios do que o MDF-e aceita',
}

export function describeMdfeRefusal(refusalCode: string): string {
  return REFUSAL_REASONS[refusalCode] ?? refusalCode
}
