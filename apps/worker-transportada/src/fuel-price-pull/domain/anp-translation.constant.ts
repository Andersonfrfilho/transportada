/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Vocabulário da ANP traduzido para o do produto. `OLEO DIESEL` seco é o S-500 — a própria planilha
 * diz isso no preâmbulo (`ATUALMENTE, O PRODUTO 'ÓLEO DIESEL' SE REFERE AO ÓLEO DIESEL B S500
 * COMUM.`), e a string `S500` não aparece em lugar nenhum do arquivo. `GASOLINA ADITIVADA` e `GLP`
 * ficam de fora do catálogo de propósito: a primeira não é um produto separado para efeito de custo
 * por quilômetro, e o segundo é vendido por botijão de 13 kg, não por unidade de rodagem.
 */
import type { FuelProduct } from './fuel.constant.js'

export const ANP_PRODUCT_BY_LABEL: Readonly<Record<string, FuelProduct>> = {
  'ETANOL HIDRATADO': 'etanol-hidratado',
  'GASOLINA COMUM': 'gasolina-comum',
  GNV: 'gnv',
  'OLEO DIESEL': 'diesel-s500',
  'OLEO DIESEL S10': 'diesel-s10',
}

export const ANP_DISCARDED_PRODUCT_LABELS: ReadonlySet<string> = new Set([
  'GASOLINA ADITIVADA',
  'GLP',
])

/** A UF chega por extenso, em caixa alta e sem acento — é assim que a planilha escreve. */
export const ANP_STATE_BY_NAME: Readonly<Record<string, string>> = {
  ACRE: 'AC',
  ALAGOAS: 'AL',
  AMAPA: 'AP',
  AMAZONAS: 'AM',
  BAHIA: 'BA',
  CEARA: 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  GOIAS: 'GO',
  MARANHAO: 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  PARA: 'PA',
  PARAIBA: 'PB',
  PARANA: 'PR',
  PERNAMBUCO: 'PE',
  PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  RONDONIA: 'RO',
  RORAIMA: 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  SERGIPE: 'SE',
  TOCANTINS: 'TO',
}
