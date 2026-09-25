/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createPostalCodeGateway } from '../../src/addresses/infrastructure/postal-code.gateway.js'

const BRASIL_API_URL = 'https://brasilapi.com.br/api/cep/v2'
const AWESOME_API_URL = 'https://cep.awesomeapi.com.br/json'
const VIA_CEP_URL = 'https://viacep.com.br/ws'
const POSTAL_CODE = '14020210'

const GOOGLE_API_KEY = 'test-google-key'

const CONFIGURATION = {
  awesomeApiUrl: AWESOME_API_URL,
  brasilApiUrl: BRASIL_API_URL,
  googleApiKey: undefined,
  viaCepUrl: VIA_CEP_URL,
} as const

const NO_PROVIDER = {
  awesomeApiUrl: undefined,
  brasilApiUrl: undefined,
  googleApiKey: undefined,
  viaCepUrl: undefined,
} as const

const ONLY_BRASIL_API = { ...NO_PROVIDER, brasilApiUrl: BRASIL_API_URL } as const
const ONLY_GOOGLE = { ...NO_PROVIDER, googleApiKey: GOOGLE_API_KEY } as const

type Call = { readonly init: RequestInit; readonly target: string }

type FakeFetch = {
  readonly calls: readonly Call[]
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>
}

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  })

/** Uma resposta por URL: o que o teste não declarou nunca deveria ser pedido. */
const fakeFetch = (
  responses: Readonly<Record<string, (init: RequestInit) => Promise<Response>>>,
): FakeFetch => {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (target: string, init: RequestInit) => {
      calls.push({ init, target })
      const responder = responses[target]
      if (responder === undefined) throw new Error(`Unexpected request to ${target}`)
      return responder(init)
    },
  }
}

const brasilApiTarget = `${BRASIL_API_URL}/${POSTAL_CODE}`
const awesomeApiTarget = `${AWESOME_API_URL}/${POSTAL_CODE}`
const viaCepTarget = `${VIA_CEP_URL}/${POSTAL_CODE}/json/`
const googleTarget = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
  components: 'country:BR|postal_code:14020-210',
  key: GOOGLE_API_KEY,
  language: 'pt-BR',
}).toString()}`

const googleBody = (postalCode: string): unknown => ({
  results: [
    {
      address_components: [
        { long_name: postalCode, short_name: postalCode, types: ['postal_code'] },
        {
          long_name: 'Avenida Independência',
          short_name: 'Av. Independência',
          types: ['route'],
        },
        {
          long_name: 'Jardim Paulista',
          short_name: 'Jardim Paulista',
          types: ['political', 'sublocality', 'sublocality_level_1'],
        },
        {
          long_name: 'Ribeirão Preto',
          short_name: 'Ribeirão Preto',
          types: ['administrative_area_level_2', 'political'],
        },
        {
          long_name: 'São Paulo',
          short_name: 'SP',
          types: ['administrative_area_level_1', 'political'],
        },
      ],
    },
  ],
  status: 'OK',
})

/** Responde só quando o sinal do pedido for abortado — o provedor lento que perdeu a corrida. */
const hangUntilAborted = (init: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
  })

const notFound = async (): Promise<Response> => json({ message: 'not found' }, 404)

const BRASIL_API_BODY = {
  city: 'Guaíra',
  neighborhood: 'Centro',
  state: 'SP',
  street: 'Rua Sete de Setembro',
}

/** Formato medido em 24/09/2026: `address` já vem com o tipo do logradouro, e a coordenada ao lado. */
const AWESOME_API_BODY = {
  address: 'Rua Radialista Alfeu Stabelini',
  address_name: 'Radialista Alfeu Stabelini',
  address_type: 'Rua',
  cep: POSTAL_CODE,
  city: 'Franca',
  district: 'Franca Pólo Club',
  lat: '-20.568185',
  lng: '-47.4',
  state: 'SP',
}

const VIA_CEP_BODY = {
  bairro: 'Vila Nova',
  localidade: 'Barrinha',
  logradouro: 'Avenida Brasil',
  uf: 'SP',
}

describe('postal code provider gateway', () => {
  test('asks the three providers at the same time', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: hangUntilAborted,
      [brasilApiTarget]: hangUntilAborted,
      [viaCepTarget]: hangUntilAborted,
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    void gateway.findByPostalCode({ postalCode: POSTAL_CODE })
    await Promise.resolve()

    expect(stub.calls.map((call) => call.target).toSorted()).toEqual(
      [awesomeApiTarget, brasilApiTarget, viaCepTarget].toSorted(),
    )
  })

  /** A BrasilAPI `/cep/v2` leva ~2 s quando resolve coordenada: quem já sabe não espera por ela. */
  test('answers with the first complete provider and aborts the ones still running', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: async () => json(AWESOME_API_BODY),
      [brasilApiTarget]: hangUntilAborted,
      [viaCepTarget]: hangUntilAborted,
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    const suggestion = await gateway.findByPostalCode({ postalCode: POSTAL_CODE })

    expect(suggestion).toEqual({
      city: 'Franca',
      district: 'Franca Pólo Club',
      state: 'SP',
      street: 'Rua Radialista Alfeu Stabelini',
    })
    expect(stub.calls.every((call) => call.init.signal?.aborted === true)).toBe(true)
  })

  test('asks for JSON with a timeout on every request', async () => {
    const stub = fakeFetch({ [brasilApiTarget]: async () => json(BRASIL_API_BODY) })
    const gateway = createPostalCodeGateway({ configuration: ONLY_BRASIL_API, fetch: stub.fetch })

    await gateway.findByPostalCode({ postalCode: POSTAL_CODE })

    const [call] = stub.calls
    expect(call?.init.headers).toEqual({ accept: 'application/json' })
    expect(call?.init.signal).toBeInstanceOf(AbortSignal)
  })

  test('reads the BrasilAPI body', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: notFound,
      [brasilApiTarget]: async () => json(BRASIL_API_BODY),
      [viaCepTarget]: notFound,
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toEqual({
      city: 'Guaíra',
      district: 'Centro',
      state: 'SP',
      street: 'Rua Sete de Setembro',
    })
  })

  test('reads the ViaCEP body when the other two do not know', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: async () => json({ code: 'not_found' }, 404),
      [brasilApiTarget]: () => Promise.reject(new Error('ECONNRESET')),
      [viaCepTarget]: async () => json(VIA_CEP_BODY),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toEqual({
      city: 'Barrinha',
      district: 'Vila Nova',
      state: 'SP',
      street: 'Avenida Brasil',
    })
  })

  /** O ViaCEP responde 200 com `{"erro": true}` para CEP inexistente — o status não acusa nada. */
  test('reads the ViaCEP 200 with erro as an empty answer', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: notFound,
      [brasilApiTarget]: notFound,
      [viaCepTarget]: async () => json({ erro: true }),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  test('answers nothing when every provider fails', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: async () => json({ message: 'boom' }, 503),
      [brasilApiTarget]: () => Promise.reject(new Error('ECONNRESET')),
      [viaCepTarget]: async () => json({ message: 'boom' }, 500),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
    expect(stub.calls).toHaveLength(3)
  })

  test('reads a body that is not the expected object as an empty answer', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: async () => json('oops'),
      [brasilApiTarget]: async () => new Response('<html>oops</html>', { status: 200 }),
      [viaCepTarget]: async () => json([1, 2, 3]),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  /** Sem ninguém completo, vale a ordem configurada: BrasilAPI, AwesomeAPI, ViaCEP. */
  test('carries the partial of the first configured provider forward', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: async () => json({ city: 'Guaíra', district: '', state: 'SP' }),
      [brasilApiTarget]: async () => json({ city: 'Guaíra ', neighborhood: 'Centro', state: 'sp' }),
      [viaCepTarget]: notFound,
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toEqual({
      city: 'Guaíra',
      district: 'Centro',
      state: 'SP',
      street: '',
    })
  })

  /** UF é sigla de duas letras: nome inteiro no campo é resposta que não cabe no formulário. */
  test('drops a state that is not a two-letter code', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => json({ ...BRASIL_API_BODY, state: 'São Paulo' }),
    })
    const gateway = createPostalCodeGateway({ configuration: ONLY_BRASIL_API, fetch: stub.fetch })

    expect((await gateway.findByPostalCode({ postalCode: POSTAL_CODE }))?.state).toBe('')
  })

  test('never asks a provider that the environment did not configure', async () => {
    const stub = fakeFetch({ [awesomeApiTarget]: async () => json(AWESOME_API_BODY) })
    const gateway = createPostalCodeGateway({
      configuration: { ...NO_PROVIDER, awesomeApiUrl: AWESOME_API_URL },
      fetch: stub.fetch,
    })

    expect((await gateway.findByPostalCode({ postalCode: POSTAL_CODE }))?.city).toBe('Franca')
    expect(stub.calls.map((call) => call.target)).toEqual([awesomeApiTarget])
  })

  /** Nenhum provedor configurado é instalação que só consulta o próprio banco — e o operador digita. */
  test('answers nothing without touching the network when no provider is configured', async () => {
    const stub = fakeFetch({})
    const gateway = createPostalCodeGateway({
      configuration: NO_PROVIDER,
      fetch: stub.fetch,
    })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
    expect(stub.calls).toHaveLength(0)
  })

  /** O Google é pago e corre junto (spec 186): o logradouro vem por extenso, a UF pela sigla. */
  test('reads the Google Geocoding body, street in full and state as its code', async () => {
    const stub = fakeFetch({ [googleTarget]: async () => json(googleBody('14020-210')) })
    const gateway = createPostalCodeGateway({ configuration: ONLY_GOOGLE, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toEqual({
      city: 'Ribeirão Preto',
      district: 'Jardim Paulista',
      state: 'SP',
      street: 'Avenida Independência',
    })
  })

  /** Filtrado por CEP, o Google ainda devolve o vizinho quando não acha o exato — rua de outro CEP. */
  test('refuses a Google answer for a different postal code', async () => {
    const stub = fakeFetch({ [googleTarget]: async () => json(googleBody('14020-200')) })
    const gateway = createPostalCodeGateway({ configuration: ONLY_GOOGLE, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  /** O Google responde 200 com `status` de erro — chave recusada e CEP desconhecido chegam assim. */
  test('reads a Google status other than OK as an empty answer', async () => {
    const stub = fakeFetch({
      [googleTarget]: async () => json({ results: [], status: 'REQUEST_DENIED' }),
    })
    const gateway = createPostalCodeGateway({ configuration: ONLY_GOOGLE, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  test('races Google with the free providers when the key is configured', async () => {
    const stub = fakeFetch({
      [awesomeApiTarget]: hangUntilAborted,
      [brasilApiTarget]: hangUntilAborted,
      [googleTarget]: hangUntilAborted,
      [viaCepTarget]: hangUntilAborted,
    })
    const gateway = createPostalCodeGateway({
      configuration: { ...CONFIGURATION, googleApiKey: GOOGLE_API_KEY },
      fetch: stub.fetch,
    })

    void gateway.findByPostalCode({ postalCode: POSTAL_CODE })
    await Promise.resolve()

    expect(stub.calls).toHaveLength(4)
  })
})
