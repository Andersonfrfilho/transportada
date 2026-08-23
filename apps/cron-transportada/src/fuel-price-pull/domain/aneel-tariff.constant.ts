/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Recorte medido no datastore da ANEEL em 21/08/2026: o recurso inteiro tem 324.609 registros, e
 * B3 · Convencional · Tarifa de Aplicação são 2.668. `DscDetalhe` entra no filtro porque as 586
 * linhas de SCEE — a compensação da geração distribuída — publicam a TE do fio B, uma ordem de
 * grandeza abaixo da tarifa comum (`34,37` contra `337,39` na mesma linha da EDP ES). Sem esse
 * quarto filtro o kWh do veículo elétrico entraria dez vezes menor sem nada reclamar.
 */
export const ANEEL_TARIFF_RESOURCE_ID = 'fcf2906c-7c32-4b9b-a637-054e7a5234f4'

export const ANEEL_TARIFF_SUBGROUP = 'B3'

export const ANEEL_TARIFF_MODALITY = 'Convencional'

export const ANEEL_TARIFF_RECORTE = {
  DscBaseTarifaria: 'Tarifa de Aplicação',
  DscDetalhe: 'Não se aplica',
  DscModalidadeTarifaria: ANEEL_TARIFF_MODALITY,
  DscSubGrupo: ANEEL_TARIFF_SUBGROUP,
} as const

/**
 * A unidade varia no recurso — linhas de demanda saem em `kW`. Dentro do recorte todas as 2.082
 * medidas vieram em `MWh`, e é essa a única que o domínio sabe converter; qualquer outra é
 * descartada em vez de lida como se fosse megawatt-hora.
 */
export const ANEEL_TARIFF_UNIT = 'MWh'

/**
 * Cópia por valor do padrão do CNPJ alfanumérico (IN RFB 2229/2024) — o mesmo CHECK que a coluna
 * `energy_tariff_references.distributor_tax_id` carrega na API. O cron não depende do pacote
 * fiscal, e um documento torto aqui viraria 500 da migration no meio do ciclo.
 */
export const ANEEL_DISTRIBUTOR_TAX_ID_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/

/** Sigla de sucata da própria fonte: existe linha publicada sem distribuidora identificada. */
export const ANEEL_UNKNOWN_DISTRIBUTOR_CODE = 'NÃO INFORMADO'

/** Teto do `limit` do CKAN por página; o recorte cabe em três chamadas. */
export const ANEEL_TARIFF_PAGE_SIZE = 1000

/** Teto de segurança do laço de páginas — o recorte não chega perto. */
export const ANEEL_TARIFF_PAGE_LIMIT = 20

/**
 * Tetos das colunas da API, copiados por valor com a tabela: a maior sigla medida na fonte tem 19
 * caracteres, e o subgrupo e a modalidade são vocabulário fechado da própria ANEEL.
 */
export const ANEEL_DISTRIBUTOR_CODE_MAX_LENGTH = 40

export const ANEEL_TARIFF_SUBGROUP_MAX_LENGTH = 10

export const ANEEL_TARIFF_MODALITY_MAX_LENGTH = 20

export const ANEEL_TARIFF_FIELDS = [
  'DatFimVigencia',
  'DatInicioVigencia',
  'DscUnidadeTerciaria',
  'NumCNPJDistribuidora',
  'SigAgente',
  'VlrTE',
  'VlrTUSD',
] as const
