/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Valores iniciais dos parâmetros do orçamento. São ponto de partida de mercado para um caminhão de
 * três eixos em carga geral, **não** dado da empresa: a empresa troca cada um pela tela, e a tela
 * mostra a origem (`default` ou `company`). Um número aqui é decisão de produto — mude com a spec.
 */
export const FREIGHT_QUOTE_DEFAULTS = {
  /** Margem sobre o preço de venda (não sobre o custo). Transporte rodoviário costuma operar de 10% a 20%. */
  marginPercent: '15.0000',
  /** Quanto do veículo costuma ir ocupado. Rateia o custo da viagem entre os embarques. */
  expectedOccupancyPercent: '85.0000',
  /** Salário, encargos e diárias do motorista rateados por km rodado. */
  driverCostPerKm: '0.9000',
  /** Manutenção preventiva e corretiva por km. */
  maintenanceCostPerKm: '0.6000',
  /** Pneus (recapagem inclusa) por km. */
  tiresCostPerKm: '0.4000',
  /** Depreciação, IPVA, seguro do veículo e rastreador por km rodado. */
  fixedCostPerKm: '0.8000',
  /** Frete-valor (ad valorem): cobre o risco de dano; mercado cobra de 0,1% a 0,5% do valor da carga. */
  adValoremPercent: '0.3000',
  /** GRIS (gerenciamento de risco): de 0,1% a 0,3% do valor da carga, mais em carga visada. */
  grisPercent: '0.2000',
  /** Consumo informado pela empresa; sem ele vale o de referência por número de eixos. */
  fuelKmPerLiter: null,
  applyAnttFloor: true,
} as const

/** km/l de referência, caminhão carregado, por número de eixos da composição. */
export const REFERENCE_FUEL_KM_PER_LITER: Readonly<Record<number, string>> = {
  2: '4.5000',
  3: '3.5000',
  4: '3.0000',
  5: '2.5000',
  6: '2.3000',
  7: '2.1000',
  8: '2.0000',
  9: '1.9000',
}
