/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A escada do CEP: banco da instalação, depois provedor público, depois o operador digita. Os dois
 * dublês contam chamadas porque o que se está fixando aqui é **quem não foi consultado** — acerto
 * completo em casa não gasta chamada externa nenhuma.
 */
import { describe, expect, test } from 'bun:test'

import type {
  PostalCodeDirectoryPort,
  PostalCodeProviderPort,
  PostalCodeProviderQuery,
  PostalCodeQuery,
} from '../../src/addresses/application/postal-code.port.js'
import { createLookupPostalCodeUseCase } from '../../src/addresses/application/lookup-postal-code.use-case.js'
import { InvalidPostalCodeError } from '../../src/addresses/domain/postal-code.error.js'
import type { PostalCodeSuggestion } from '../../src/addresses/domain/postal-code-suggestion.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const POSTAL_CODE = '14020210'

const COMPLETE: PostalCodeSuggestion = {
  city: 'Ribeirão Preto',
  district: 'Jardim Paulista',
  state: 'SP',
  street: 'Avenida Independência',
}

/** O que as duas colunas de CEP do MDF-e sabem responder: a UF, e nada além dela. */
const LOCAL_PARTIAL: PostalCodeSuggestion = { city: '', district: '', state: 'SP', street: '' }

/** CEP de cidade inteira: o provedor sabe cidade e UF, não o logradouro — ele não existe. */
const PROVIDER_PARTIAL: PostalCodeSuggestion = {
  city: 'Guaíra',
  district: '',
  state: 'SP',
  street: '',
}

type FakeDirectory = PostalCodeDirectoryPort & { readonly queries: PostalCodeQuery[] }
type FakeProvider = PostalCodeProviderPort & { readonly queries: PostalCodeProviderQuery[] }

const fakeDirectory = (answer: PostalCodeSuggestion | null | Error): FakeDirectory => {
  const queries: PostalCodeQuery[] = []
  return {
    findByPostalCode: async (query) => {
      queries.push(query)
      if (answer instanceof Error) throw answer
      return answer
    },
    queries,
  }
}

const fakeProvider = (answer: PostalCodeSuggestion | null): FakeProvider => {
  const queries: PostalCodeProviderQuery[] = []
  return {
    findByPostalCode: async (query) => {
      queries.push(query)
      return answer
    },
    queries,
  }
}

const buildUseCase = (directory: FakeDirectory, provider: FakeProvider) =>
  createLookupPostalCodeUseCase({ directory, provider })

describe('postal code lookup contract', () => {
  test('answers from the installation database without asking any provider', async () => {
    const directory = fakeDirectory(COMPLETE)
    const provider = fakeProvider(PROVIDER_PARTIAL)

    const suggestion = await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(suggestion).toEqual(COMPLETE)
    expect(provider.queries).toHaveLength(0)
  })

  /** Parcial não encerra a escada: parar na UF deixaria o logradouro em branco tendo quem soubesse. */
  test('keeps climbing when the local answer is partial', async () => {
    const directory = fakeDirectory(LOCAL_PARTIAL)
    const provider = fakeProvider(PROVIDER_PARTIAL)

    const suggestion = await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(suggestion).toEqual(PROVIDER_PARTIAL)
    expect(provider.queries).toHaveLength(1)
  })

  /** Melhor a UF certa que campo em branco: o parcial guardado responde quando mais nada respondeu. */
  test('falls back to the local partial when no provider knew', async () => {
    const directory = fakeDirectory(LOCAL_PARTIAL)
    const provider = fakeProvider(null)

    const suggestion = await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(suggestion).toEqual(LOCAL_PARTIAL)
    expect(provider.queries).toHaveLength(1)
  })

  test('asks the provider when the installation database knows nothing', async () => {
    const directory = fakeDirectory(null)
    const provider = fakeProvider(COMPLETE)

    const suggestion = await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(suggestion).toEqual(COMPLETE)
    expect(provider.queries).toEqual([{ postalCode: POSTAL_CODE }])
  })

  /** Ninguém soube: a resposta é vazia e o operador digita — nada é bloqueado nem limpo. */
  test('answers nothing when neither the database nor the providers knew', async () => {
    const directory = fakeDirectory(null)
    const provider = fakeProvider(null)

    const suggestion = await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(suggestion).toBeNull()
  })

  test('canonicalizes the postal code before asking either side', async () => {
    const directory = fakeDirectory(null)
    const provider = fakeProvider(COMPLETE)

    await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: '14020-210',
    })

    expect(directory.queries).toEqual([{ companyId: COMPANY_ID, postalCode: POSTAL_CODE }])
    expect(provider.queries).toEqual([{ postalCode: POSTAL_CODE }])
  })

  /** De quem é o CEP é assunto nosso: a empresa entra na consulta local e não sai da instalação. */
  test('never hands the company to a third party', async () => {
    const directory = fakeDirectory(null)
    const provider = fakeProvider(COMPLETE)

    await buildUseCase(directory, provider).execute({
      companyId: COMPANY_ID,
      postalCode: POSTAL_CODE,
    })

    expect(Object.keys(provider.queries[0] ?? {})).toEqual(['postalCode'])
  })

  test('refuses a malformed postal code at the boundary', async () => {
    const directory = fakeDirectory(COMPLETE)
    const provider = fakeProvider(COMPLETE)

    await expect(
      buildUseCase(directory, provider).execute({ companyId: COMPANY_ID, postalCode: '1402' }),
    ).rejects.toBeInstanceOf(InvalidPostalCodeError)
    expect(directory.queries).toHaveLength(0)
    expect(provider.queries).toHaveLength(0)
  })

  /** Banco quebrado é defeito nosso: sobe para a fronteira em vez de virar "CEP não encontrado". */
  test('lets a failing database surface instead of asking a provider', async () => {
    const directory = fakeDirectory(new Error('connection terminated'))
    const provider = fakeProvider(COMPLETE)

    await expect(
      buildUseCase(directory, provider).execute({ companyId: COMPANY_ID, postalCode: POSTAL_CODE }),
    ).rejects.toThrow('connection terminated')
    expect(provider.queries).toHaveLength(0)
  })
})
