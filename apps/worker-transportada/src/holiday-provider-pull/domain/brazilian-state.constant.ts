/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `BRAZILIAN_STATE_IBGE_CODE_LIST` em
 * `api-transportada/src/shared/business-calendar.constant.ts` (as duas apps não importam código uma da
 * outra); `test/holiday-provider-pull/parity.contract.ts` cobra a igualdade.
 */

/** As 27 unidades da federação pelo código IBGE, que é o prefixo do código do município. */
export const BRAZILIAN_STATE_IBGE_CODE_LIST = [
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '31',
  '32',
  '33',
  '35',
  '41',
  '42',
  '43',
  '50',
  '51',
  '52',
  '53',
] as const

export type BrazilianStateIbgeCode = (typeof BRAZILIAN_STATE_IBGE_CODE_LIST)[number]

/** O fornecedor chama o estado pela sigla no caminho (`/feriados/estado/{uf}`). */
export const BRAZILIAN_STATE_ABBREVIATION_BY_IBGE_CODE: Readonly<
  Record<BrazilianStateIbgeCode, string>
> = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
}
