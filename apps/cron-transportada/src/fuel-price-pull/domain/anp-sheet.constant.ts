/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Rótulos literais da aba `ESTADOS` do resumo semanal, medidos em T000. O cabeçalho é procurado
 * por estes textos e não pela posição: o preâmbulo institucional muda de tamanho entre publicações,
 * e uma linha a mais deslocaria toda contagem.
 */
export const ANP_STATE_SHEET_NAME = 'ESTADOS'

export const ANP_HEADER_LABEL = {
  averagePrice: 'PREÇO MÉDIO REVENDA',
  endingDate: 'DATA FINAL',
  maximumPrice: 'PREÇO MÁXIMO REVENDA',
  minimumPrice: 'PREÇO MÍNIMO REVENDA',
  product: 'PRODUTO',
  region: 'REGIAO',
  standardDeviation: 'DESVIO PADRÃO REVENDA',
  startingDate: 'DATA INICIAL',
  state: 'ESTADOS',
  stationCount: 'NÚMERO DE POSTOS PESQUISADOS',
  unit: 'UNIDADE DE MEDIDA',
  variationCoefficient: 'COEF DE VARIAÇÃO REVENDA',
} as const

export const ANP_HEADER_LABELS: readonly string[] = [
  ANP_HEADER_LABEL.startingDate,
  ANP_HEADER_LABEL.endingDate,
  ANP_HEADER_LABEL.region,
  ANP_HEADER_LABEL.state,
  ANP_HEADER_LABEL.product,
  ANP_HEADER_LABEL.stationCount,
  ANP_HEADER_LABEL.unit,
  ANP_HEADER_LABEL.averagePrice,
  ANP_HEADER_LABEL.standardDeviation,
  ANP_HEADER_LABEL.minimumPrice,
  ANP_HEADER_LABEL.maximumPrice,
  ANP_HEADER_LABEL.variationCoefficient,
]
