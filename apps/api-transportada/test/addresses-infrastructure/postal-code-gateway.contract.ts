/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createPostalCodeGateway } from '../../src/addresses/infrastructure/postal-code.gateway.js'

const BRASIL_API_URL = 'https://brasilapi.com.br/api/cep/v2'
const VIA_CEP_URL = 'https://viacep.com.br/ws'
const POSTAL_CODE = '14020210'

const CONFIGURATION = { brasilApiUrl: BRASIL_API_URL, viaCepUrl: VIA_CEP_URL } as const

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
const fakeFetch = (responses: Readonly<Record<string, () => Promise<Response>>>): FakeFetch => {
  const calls: Call[] = []
  return {
    calls,
    fetch: async (target: string, init: RequestInit) => {
      calls.push({ init, target })
      const responder = responses[target]
      if (responder === undefined) throw new Error(`Unexpected request to ${target}`)
      return responder()
    },
  }
}

const brasilApiTarget = `${BRASIL_API_URL}/${POSTAL_CODE}`
const viaCepTarget = `${VIA_CEP_URL}/${POSTAL_CODE}/json/`

const BRASIL_API_BODY = {
  city: 'Guaíra',
  neighborhood: 'Centro',
  state: 'SP',
  street: 'Rua Sete de Setembro',
}

const VIA_CEP_BODY = {
  bairro: 'Vila Nova',
  localidade: 'Barrinha',
  logradouro: 'Avenida Brasil',
  uf: 'SP',
}

describe('postal code provider gateway', () => {
  test('asks BrasilAPI first and never reaches ViaCEP when it answers', async () => {
    const stub = fakeFetch({ [brasilApiTarget]: async () => json(BRASIL_API_BODY) })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    const suggestion = await gateway.findByPostalCode({ postalCode: POSTAL_CODE })

    expect(suggestion).toEqual({
      city: 'Guaíra',
      district: 'Centro',
      state: 'SP',
      street: 'Rua Sete de Setembro',
    })
    expect(stub.calls.map((call) => call.target)).toEqual([brasilApiTarget])
  })

  test('asks for JSON with a timeout on every request', async () => {
    const stub = fakeFetch({ [brasilApiTarget]: async () => json(BRASIL_API_BODY) })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    await gateway.findByPostalCode({ postalCode: POSTAL_CODE })

    const [call] = stub.calls
    expect(call?.init.headers).toEqual({ accept: 'application/json' })
    expect(call?.init.signal).toBeInstanceOf(AbortSignal)
  })

  test('falls back to ViaCEP when BrasilAPI answers a failing status', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => json({ message: 'not found' }, 404),
      [viaCepTarget]: async () => json(VIA_CEP_BODY),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    const suggestion = await gateway.findByPostalCode({ postalCode: POSTAL_CODE })

    expect(suggestion).toEqual({
      city: 'Barrinha',
      district: 'Vila Nova',
      state: 'SP',
      street: 'Avenida Brasil',
    })
    expect(stub.calls.map((call) => call.target)).toEqual([brasilApiTarget, viaCepTarget])
  })

  test('falls back to ViaCEP when BrasilAPI loses the connection', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: () => Promise.reject(new Error('ECONNRESET')),
      [viaCepTarget]: async () => json(VIA_CEP_BODY),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect((await gateway.findByPostalCode({ postalCode: POSTAL_CODE }))?.city).toBe('Barrinha')
    expect(stub.calls.map((call) => call.target)).toEqual([brasilApiTarget, viaCepTarget])
  })

  /** O ViaCEP responde 200 com `{"erro": true}` para CEP inexistente — o status não acusa nada. */
  test('reads the ViaCEP 200 with erro as an empty answer', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => json({ message: 'not found' }, 404),
      [viaCepTarget]: async () => json({ erro: true }),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  test('answers nothing when both providers fail', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: () => Promise.reject(new Error('ECONNRESET')),
      [viaCepTarget]: async () => json({ message: 'boom' }, 500),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
    expect(stub.calls).toHaveLength(2)
  })

  test('reads a body that is not the expected object as an empty answer', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => new Response('<html>oops</html>', { status: 200 }),
      [viaCepTarget]: async () => json([1, 2, 3]),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
  })

  test('carries a partial answer forward instead of discarding it', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => json({ city: 'Guaíra ', neighborhood: '', state: 'sp' }),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toEqual({
      city: 'Guaíra',
      district: '',
      state: 'SP',
      street: '',
    })
  })

  /** UF é sigla de duas letras: nome inteiro no campo é resposta que não cabe no formulário. */
  test('drops a state that is not a two-letter code', async () => {
    const stub = fakeFetch({
      [brasilApiTarget]: async () => json({ ...BRASIL_API_BODY, state: 'São Paulo' }),
    })
    const gateway = createPostalCodeGateway({ configuration: CONFIGURATION, fetch: stub.fetch })

    expect((await gateway.findByPostalCode({ postalCode: POSTAL_CODE }))?.state).toBe('')
  })

  test('never asks a provider that the environment did not configure', async () => {
    const stub = fakeFetch({ [viaCepTarget]: async () => json(VIA_CEP_BODY) })
    const gateway = createPostalCodeGateway({
      configuration: { brasilApiUrl: undefined, viaCepUrl: VIA_CEP_URL },
      fetch: stub.fetch,
    })

    expect((await gateway.findByPostalCode({ postalCode: POSTAL_CODE }))?.city).toBe('Barrinha')
    expect(stub.calls.map((call) => call.target)).toEqual([viaCepTarget])
  })

  /** Nenhum provedor configurado é instalação que só consulta o próprio banco — e o operador digita. */
  test('answers nothing without touching the network when no provider is configured', async () => {
    const stub = fakeFetch({})
    const gateway = createPostalCodeGateway({
      configuration: { brasilApiUrl: undefined, viaCepUrl: undefined },
      fetch: stub.fetch,
    })

    expect(await gateway.findByPostalCode({ postalCode: POSTAL_CODE })).toBeNull()
    expect(stub.calls).toHaveLength(0)
  })
})
