/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  cityCodeFromAddressKey,
  isGenericCityPostalCode,
  isValidCityCode,
  validateAddressCorrectionFields,
  type AddressCorrectionFields,
} from '../../src/modules/nfe-workspace/shared/addressCorrection.validation'
import {
  formatCityCode,
  formatPostalCode,
  stripCityCode,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionMask.service'
import {
  AddressCorrectionRequestError,
  fieldLabelKey,
  readErrorCode,
  readErrorDetails,
  toFieldErrorMap,
  toInvalidFieldNames,
} from '../../src/modules/nfe-workspace/shared/addressCorrectionRequestError.service'
import { createNfeWorkspaceClient } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

const VALID_FIELDS: AddressCorrectionFields = {
  city: 'RIBEIRAO PRETO',
  cityCode: '3543402',
  complement: '',
  district: 'CENTRO',
  number: '533',
  postalCode: '14010100',
  state: 'SP',
  street: 'R AMERICA DE ARAUJO PERES',
}

function synthesizedErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'INVALID_REQUEST',
        correlationId: 'synthetic-correlation-id',
        details: [
          { field: 'proposed.postalCode', message: 'Invalid' },
          { field: 'proposed.cityCode', message: 'cityCode must start with the IBGE prefix' },
          { field: 'proposed.somethingNew', message: 'unknown field the client does not label' },
        ],
        message: 'Invalid request',
      },
    }),
    { headers: { 'content-type': 'application/json' }, status: 400 },
  )
}

describe('pedido de correção de endereço (spec 150, T201)', () => {
  test('endereço válido não gera nenhum erro', () => {
    expect(validateAddressCorrectionFields(VALID_FIELDS)).toEqual({})
  })

  test('logradouro, número e município em branco são recusados', () => {
    const errors = validateAddressCorrectionFields({
      ...VALID_FIELDS,
      city: '  ',
      number: '',
      street: '',
    })
    expect(errors.street).toBe('addressCorrection.error.streetRequired')
    expect(errors.number).toBe('addressCorrection.error.numberRequired')
    expect(errors.city).toBe('addressCorrection.error.cityRequired')
  })

  test('UF fora das 27 é recusada', () => {
    const errors = validateAddressCorrectionFields({ ...VALID_FIELDS, state: 'XX' })
    expect(errors.state).toBe('addressCorrection.error.stateInvalid')
  })

  test('CEP precisa ter 8 dígitos', () => {
    expect(
      validateAddressCorrectionFields({ ...VALID_FIELDS, postalCode: '1401010' }).postalCode,
    ).toBe('addressCorrection.error.postalCodeInvalid')
    expect(
      validateAddressCorrectionFields({ ...VALID_FIELDS, postalCode: '14010-100' }).postalCode,
    ).toBe(undefined)
  })

  /** RF3: o código IBGE de 7 dígitos precisa começar pelo prefixo de UF da própria UF proposta. */
  test('código IBGE de outra UF é recusado sozinho', () => {
    expect(isValidCityCode({ cityCode: '3543402', state: 'SP' })).toBe(true)
    expect(isValidCityCode({ cityCode: '3304557', state: 'SP' })).toBe(false)
    const errors = validateAddressCorrectionFields({
      ...VALID_FIELDS,
      cityCode: '3304557',
      state: 'SP',
    })
    expect(errors.cityCode).toBe('addressCorrection.error.cityCodeInvalid')
    expect(errors.state).toBeUndefined()
  })

  test('máscara do código IBGE aceita só 7 dígitos', () => {
    expect(formatCityCode('35.434-02x9')).toBe('3543402')
    expect(stripCityCode('35.434-02x9')).toBe('35434029')
  })

  test('máscara de CEP', () => {
    expect(formatPostalCode('14010100')).toBe('14010-100')
  })

  test('cityCode inicial vem do primeiro segmento da addressKey', () => {
    expect(cityCodeFromAddressKey('3527256|14210000|533')).toBe('3527256')
    expect(cityCodeFromAddressKey('|14210000|533')).toBe('')
  })

  /** CEP de cidade de CEP único (084 T14) — nunca sugerir que ele está errado. */
  test('CEP terminado em -000 vira dica, não erro', () => {
    expect(isGenericCityPostalCode('14210-000')).toBe(true)
    expect(isGenericCityPostalCode('14210-100')).toBe(false)
  })

  test('detalhes do erro do servidor viram mapa por campo, sem o prefixo proposed.', () => {
    const error = new AddressCorrectionRequestError({
      code: 'INVALID_REQUEST',
      details: [
        { field: 'proposed.postalCode', message: 'Invalid' },
        { field: 'proposed.street', message: 'Invalid' },
      ],
    })
    expect(toFieldErrorMap(error)).toEqual({ postalCode: 'Invalid', street: 'Invalid' })
    expect(toInvalidFieldNames(error)).toEqual(['postalCode', 'street'])
  })

  /** web.md §11 item 4: campo sem rótulo conhecido não some do aviso — sai com o nome cru. */
  test('campo que o formulário não conhece não tem rótulo', () => {
    expect(fieldLabelKey('proposed.postalCode')).toBe('addressCorrection.field.postalCode')
    expect(fieldLabelKey('proposed.somethingNew')).toBeUndefined()
  })

  test('lê código e detalhes de um corpo de erro cru', () => {
    const payload = {
      error: { code: 'INVALID_REQUEST', details: [{ field: 'proposed.city', message: 'Invalid' }] },
    }
    expect(readErrorCode(payload)).toBe('INVALID_REQUEST')
    expect(readErrorDetails(payload)).toEqual([{ field: 'proposed.city', message: 'Invalid' }])
    expect(readErrorCode({})).toBeUndefined()
  })

  test('o client monta o PUT com a addressKey codificada e o corpo certo', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                addressKey: '3543402|14010100|533',
                id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3ea1',
                proposed: VALID_FIELDS,
                reasonDistanceMetres: null,
                reasonMatchLevel: 'unresolved',
                recipientName: 'JOAO DA SILVA',
                reported: VALID_FIELDS,
                sentAt: null,
                status: 'draft',
              },
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const saved = await client.saveAddressCorrection({
      addressKey: '3543402|14010100|533',
      proposed: VALID_FIELDS,
    })

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('PUT')
    expect(request.url).toBe(
      'https://api.example.test/address-correction-requests/3543402%7C14010100%7C533',
    )
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-access-token')
    expect(await request.clone().json()).toEqual({ proposed: VALID_FIELDS })
    expect(saved.status).toBe('draft')
    expect(saved.recipientName).toBe('JOAO DA SILVA')
  })

  test('o client lê a lista de pedidos em GET /address-correction-requests', async () => {
    const requests: Request[] = []
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  addressKey: '3543402|14010100|533',
                  id: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3ea1',
                  proposed: VALID_FIELDS,
                  reasonDistanceMetres: null,
                  reasonMatchLevel: 'unresolved',
                  recipientName: null,
                  reported: VALID_FIELDS,
                  sentAt: null,
                  status: 'draft',
                },
              ],
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        )
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const list = await client.listAddressCorrectionRequests()

    const [request] = requests
    if (request === undefined) throw new Error('ADDRESS_CORRECTION_CONTRACT_REQUEST_MISSING')
    expect(request.method).toBe('GET')
    expect(request.url).toBe('https://api.example.test/address-correction-requests')
    expect(list).toHaveLength(1)
    expect(list[0]?.status).toBe('draft')
  })

  /** RF3: a recusa lista todos os campos, e o cliente carrega o detalhe até o `throw`. */
  test('o client joga o erro com os detalhes do 400, campo desconhecido incluído', async () => {
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () => Promise.resolve(synthesizedErrorResponse()),
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    let caught: unknown
    try {
      await client.saveAddressCorrection({
        addressKey: '3543402|14010100|533',
        proposed: VALID_FIELDS,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AddressCorrectionRequestError)
    const error = caught as AddressCorrectionRequestError
    expect(error.message).toBe('INVALID_REQUEST')
    expect(toInvalidFieldNames(error)).toEqual(['postalCode', 'cityCode', 'somethingNew'])
    expect(fieldLabelKey('somethingNew')).toBeUndefined()
  })

  /**
   * Spec 150, correção Fase 4, item 11: `POST /address-correction-requests/mail` é rota limitada
   * (`rateLimit: { store: 'postgres', ... }`, `http.md` §RF18) — o `429` carrega `Retry-After` em
   * segundos, e o client precisa expor esse valor para a tela mostrar "tente de novo em N min".
   */
  test('429 do limitador carrega o Retry-After no erro', async () => {
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'TOO_MANY_REQUESTS' } }), {
            headers: { 'content-type': 'application/json', 'retry-after': '90' },
            status: 429,
          }),
        ),
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    let caught: unknown
    try {
      await client.saveAddressCorrection({
        addressKey: '3543402|14010100|533',
        proposed: VALID_FIELDS,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AddressCorrectionRequestError)
    const error = caught as AddressCorrectionRequestError
    expect(error.message).toBe('TOO_MANY_REQUESTS')
    expect(error.retryAfterSeconds).toBe(90)
  })
})
