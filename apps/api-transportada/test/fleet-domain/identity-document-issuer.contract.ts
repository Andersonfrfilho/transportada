/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  IDENTITY_DOCUMENT_ISSUERS,
  IDENTITY_DOCUMENT_MAX_LENGTH,
} from '../../src/shared/identity-document-issuer.constant.js'

/**
 * O bundle do frontend não carrega código desta app: a lista é reescrita lá, e o que impede as duas
 * de divergirem é cada lado restatá-la — a mesma disciplina de `FUEL_TYPES` e `VEHICLE_TYPES`. Este
 * literal é a metade da API; a outra é `frontend-transportada/test/fleet/identity-document.contract.ts`.
 * A ordem faz parte do contrato: ela é a ordem do select que o operador lê.
 */
const CATALOG = [
  'SSP',
  'PC',
  'DETRAN',
  'SDS',
  'IFP',
  'IML',
  'DIC',
  'SJS',
  'SES',
  'PF',
  'MEX',
  'MAER',
  'MMA',
  'OAB',
  'CTPS',
  'RNE',
  'OUTROS',
] as const

describe('identity document issuer catalog', () => {
  test('names the seventeen issuers, in the order the select shows them', () => {
    expect(IDENTITY_DOCUMENT_ISSUERS).toEqual(CATALOG)
    expect(IDENTITY_DOCUMENT_MAX_LENGTH).toBe(20)
  })

  /**
   * `OUTROS` fecha a lista porque o campo é fechado: sem ele, o órgão de um estado que ninguém previu
   * viraria cadastro impossível de concluir, e o CHECK recusaria a ficha inteira.
   */
  test('keeps the escape hatch last', () => {
    expect(IDENTITY_DOCUMENT_ISSUERS.at(-1)).toBe('OUTROS')
    expect(IDENTITY_DOCUMENT_ISSUERS).not.toContain('')
  })

  /** Sigla repetida passaria pelo CHECK e daria duas linhas iguais no select. */
  test('says each sigla once', () => {
    expect(new Set(IDENTITY_DOCUMENT_ISSUERS).size).toBe(IDENTITY_DOCUMENT_ISSUERS.length)
  })
})
