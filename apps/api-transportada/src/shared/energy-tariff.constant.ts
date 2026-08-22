/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * `SigAgente` da ANEEL — sigla curta da distribuidora, a mesma que sai impressa na conta de luz, e
 * a maior medida na fonte tem 19 caracteres. Razão social não existe no recurso: o que acompanha a
 * sigla é o CNPJ (`NumCNPJDistribuidora`), guardado como identificação e não como chave.
 */
export const ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH = 40

export const ENERGY_TARIFF_SUBGROUP_MAX_LENGTH = 10

export const ENERGY_TARIFF_MODALITY_MAX_LENGTH = 20

/**
 * A tarifa homologada é seca: sem ICMS, sem PIS/COFINS e sem bandeira. O fator é o que a empresa
 * declara para chegar ao que a conta cobra, e sem declaração ele é `1` — não inventamos imposto que
 * não medimos, e número que se apresenta como final sem ser seria pior que número ausente.
 */
export const DEFAULT_ENERGY_ADJUSTMENT_FACTOR = '1.0000'

/**
 * A ANEEL homologa em R$/MWh e o veículo consome em kWh. A conversão é de unidade, não de moeda:
 * ela mora ao lado da tarifa para o preço efetivo não ser derivado de um mil solto no domínio.
 */
export const KILOWATT_HOURS_PER_MEGAWATT_HOUR = 1000n

/**
 * O recorte que a coleta grava, copiado por valor do cron: ele entra na chave natural da tabela, e a
 * mesma distribuidora publica linha em mais de um subgrupo. Sem fixá-lo na leitura, a linha do SCEE
 * — que traz a TE do fio B, uma ordem de grandeza abaixo — passaria por tarifa comum e o kWh do
 * veículo entraria dez vezes menor sem nada reclamar.
 */
export const ENERGY_TARIFF_SUBGROUP = 'B3'

export const ENERGY_TARIFF_MODALITY = 'Convencional'
