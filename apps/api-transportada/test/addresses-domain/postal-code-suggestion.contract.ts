/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { InvalidPostalCodeError } from '../../src/addresses/domain/postal-code.error.js'
import {
  isCompletePostalCodeSuggestion,
  parsePostalCode,
  selectPostalCodeSuggestion,
  type PostalCodeAddressRow,
} from '../../src/addresses/domain/postal-code-suggestion.policy.js'

type RowOverrides = Partial<PostalCodeAddressRow>

function addressRow(overrides: RowOverrides = {}): PostalCodeAddressRow {
  return {
    city: 'Ribeirão Preto',
    district: 'Centro',
    recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    state: 'SP',
    street: 'Rua Álvares Cabral',
    ...overrides,
  }
}

describe('postal code boundary', () => {
  /**
   * O campo da tela manda o CEP com máscara e o banco guarda oito dígitos. Canonicalizar na fronteira
   * é o que impede `14020-210` e `14020210` de serem dois CEPs diferentes na mesma consulta.
   */
  test('accepts eight digits with and without mask', () => {
    expect(parsePostalCode('14020210')).toBe('14020210')
    expect(parsePostalCode('14020-210')).toBe('14020210')
    expect(parsePostalCode(' 14.020-210 ')).toBe('14020210')
  })

  test('refuses anything that is not eight digits', () => {
    for (const invalid of ['', '1402021', '140202100', '1402021O', 'abcdefgh', '14020-21']) {
      expect(() => parsePostalCode(invalid)).toThrow(InvalidPostalCodeError)
    }
  })

  test('answers with the stable code and status of a boundary refusal', () => {
    const error = new InvalidPostalCodeError()
    expect(error.code).toBe('POSTAL_CODE_INVALID')
    expect(error.status).toBe(400)
  })
})

describe('postal code suggestion', () => {
  /**
   * Nessas tabelas o número é a casa de uma pessoa ou de uma empresa: devolvê-lo num autocompletar
   * diria a quem digita **quem mora naquele CEP**. O tipo da sugestão não tem onde guardá-lo — a
   * ausência é estrutural, não disciplina de quem escreve o mapper.
   */
  test('never carries the house number nor the complement', () => {
    const suggestion = selectPostalCodeSuggestion([addressRow()])

    expect(suggestion).not.toBeNull()
    expect(Object.keys(suggestion ?? {}).toSorted()).toEqual([
      'city',
      'district',
      'state',
      'street',
    ])
  })

  /**
   * Sem regra explícita, duas importações da mesma rua com grafias diferentes fariam a tela
   * responder de um jeito hoje e de outro amanhã.
   */
  test('breaks a tie by filled street first and then by the most recent row', () => {
    const suggestion = selectPostalCodeSuggestion([
      addressRow({
        recordedAt: new Date('2026-03-01T00:00:00.000Z'),
        street: '',
      }),
      addressRow({
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        street: 'Rua Alvares Cabral',
      }),
      addressRow({
        recordedAt: new Date('2026-02-01T00:00:00.000Z'),
        street: 'Rua Álvares Cabral',
      }),
    ])

    expect(suggestion?.street).toBe('Rua Álvares Cabral')
  })

  test('canonicalizes the state and trims what the row carries', () => {
    const suggestion = selectPostalCodeSuggestion([
      addressRow({ city: ' Guaíra ', state: 'sp', street: '  Rua Sete  ' }),
    ])

    expect(suggestion).toEqual({
      city: 'Guaíra',
      district: 'Centro',
      state: 'SP',
      street: 'Rua Sete',
    })
  })

  test('answers nothing when every row is empty', () => {
    expect(selectPostalCodeSuggestion([])).toBeNull()
    expect(
      selectPostalCodeSuggestion([
        addressRow({ city: '', district: '', state: '', street: '' }),
        addressRow({ city: '   ', district: '   ', state: '   ', street: '   ' }),
      ]),
    ).toBeNull()
  })

  /**
   * O MDF-e responde só a UF de um CEP. Se isso contasse como acerto, a escada pararia com o
   * logradouro vazio e a BrasilAPI nunca seria consultada — o parcial precisa ser reconhecível.
   */
  test('separates a complete suggestion from a partial one', () => {
    const complete = selectPostalCodeSuggestion([addressRow()])
    const stateOnly = selectPostalCodeSuggestion([
      addressRow({ city: '', district: '', street: '' }),
    ])
    const withoutStreet = selectPostalCodeSuggestion([addressRow({ street: '' })])

    expect(isCompletePostalCodeSuggestion(complete)).toBe(true)
    expect(isCompletePostalCodeSuggestion(stateOnly)).toBe(false)
    expect(isCompletePostalCodeSuggestion(withoutStreet)).toBe(false)
    expect(isCompletePostalCodeSuggestion(null)).toBe(false)
    expect(stateOnly).toEqual({ city: '', district: '', state: 'SP', street: '' })
  })
})
