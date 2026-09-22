/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As 27 UFs e o prefixo de dois dígitos do código IBGE de município de cada uma (RF3): o `cityCode`
 * proposto precisa começar por esse prefixo para casar com a UF proposta — um `cityCode` de São
 * Paulo com `state: 'RJ'` é o erro de digitação que a validação existe para recusar.
 */
export const BRAZILIAN_STATE_IBGE_PREFIX = {
  AC: '12',
  AL: '27',
  AM: '13',
  AP: '16',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MG: '31',
  MS: '50',
  MT: '51',
  PA: '15',
  PB: '25',
  PE: '26',
  PI: '22',
  PR: '41',
  RJ: '33',
  RN: '24',
  RO: '11',
  RR: '14',
  RS: '43',
  SC: '42',
  SE: '28',
  SP: '35',
  TO: '17',
} as const

export type BrazilianState = keyof typeof BRAZILIAN_STATE_IBGE_PREFIX

export const BRAZILIAN_STATES = Object.keys(
  BRAZILIAN_STATE_IBGE_PREFIX,
) as readonly BrazilianState[]
