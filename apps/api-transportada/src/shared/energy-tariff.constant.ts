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
