/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 068 — os contatos e as redes da empresa. A fronteira diz as duas metades do CHECK do banco em
 * vez de deixar o operador receber 500: telefone é só dígito, e-mail tem forma de e-mail, e e-mail
 * nunca é WhatsApp.
 */
import { describe, expect, test } from 'bun:test'

import { createCompanyContactsUseCase } from '../../src/companies/application/company-contacts.use-case.js'
import type { CompanyContactSettings } from '../../src/companies/application/company-contacts.port.js'
import { parseCompanyContactsBody } from '../../src/companies/presentation/company-contacts.schema.js'

const FULL_SETTINGS = {
  contacts: [
    { isWhatsapp: false, kind: 'phone', label: 'Comercial', value: '1633334444' },
    { isWhatsapp: true, kind: 'phone', label: 'WhatsApp', value: '5516999991234' },
    { isWhatsapp: false, kind: 'email', label: '', value: 'contato@exemplo.com.br' },
  ],
  socialLinks: [{ network: 'instagram', url: 'https://instagram.com/exemplo' }],
} as const

function bodyOf(payload: unknown): Request {
  return new Request('https://api.exemplo.com.br/company-settings/contacts', {
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

function memoryRepository(initial?: CompanyContactSettings) {
  const store = new Map<string, CompanyContactSettings>()
  if (initial !== undefined) store.set('company-a', initial)

  return {
    calls: [] as string[],
    port: {
      load: async (input: { readonly companyId: string }) =>
        store.get(input.companyId) ?? { contacts: [], socialLinks: [] },
      replace: async (input: {
        readonly companyId: string
        readonly settings: CompanyContactSettings
      }) => {
        store.set(input.companyId, input.settings)
        return input.settings
      },
    },
  }
}

describe('contatos e redes da empresa (spec 068)', () => {
  test('aceita vários telefones, marca de WhatsApp e rede social', async () => {
    const parsed = await parseCompanyContactsBody(bodyOf(FULL_SETTINGS))

    expect(parsed.contacts).toHaveLength(3)
    expect(parsed.contacts[1]?.isWhatsapp).toBe(true)
    expect(parsed.socialLinks[0]?.network).toBe('instagram')
  })

  test('telefone com máscara é recusado — o formato do banco é só dígito', async () => {
    await expect(
      parseCompanyContactsBody(
        bodyOf({ contacts: [{ kind: 'phone', value: '(16) 3333-4444' }], socialLinks: [] }),
      ),
    ).rejects.toThrow()
  })

  /** E-mail não tem WhatsApp, e dizer isso na fronteira poupa o 500 do CHECK. */
  test('e-mail marcado como WhatsApp é recusado', async () => {
    await expect(
      parseCompanyContactsBody(
        bodyOf({
          contacts: [{ isWhatsapp: true, kind: 'email', value: 'contato@exemplo.com.br' }],
          socialLinks: [],
        }),
      ),
    ).rejects.toThrow()
  })

  test('perfil em `http` é recusado — a página que o publica é `https`', async () => {
    await expect(
      parseCompanyContactsBody(
        bodyOf({ contacts: [], socialLinks: [{ network: 'instagram', url: 'http://x.com/a' }] }),
      ),
    ).rejects.toThrow()
  })

  test('rede fora do catálogo é recusada, e a mesma rede duas vezes também', async () => {
    await expect(
      parseCompanyContactsBody(
        bodyOf({ contacts: [], socialLinks: [{ network: 'orkut', url: 'https://orkut.com/a' }] }),
      ),
    ).rejects.toThrow()
    await expect(
      parseCompanyContactsBody(
        bodyOf({
          contacts: [],
          socialLinks: [
            { network: 'instagram', url: 'https://instagram.com/a' },
            { network: 'instagram', url: 'https://instagram.com/b' },
          ],
        }),
      ),
    ).rejects.toThrow()
  })

  test('cadastro vazio é estado válido, não erro', async () => {
    const parsed = await parseCompanyContactsBody(bodyOf({ contacts: [], socialLinks: [] }))

    expect(parsed).toEqual({ contacts: [], socialLinks: [] })
  })

  /**
   * ⚠️ O contrato negativo que importa: a leitura é por `companyId`, e o cadastro de uma empresa não
   * pode aparecer na outra. Aqui isso se prova no caso de uso; a query tem o teste dela no schema.
   */
  test('o cadastro de uma empresa não vaza na outra', async () => {
    const repository = memoryRepository()
    const useCase = createCompanyContactsUseCase({ contacts: repository.port })

    await useCase.replace({ companyId: 'company-a', settings: FULL_SETTINGS })

    expect((await useCase.get({ companyId: 'company-a' })).contacts).toHaveLength(3)
    expect(await useCase.get({ companyId: 'company-b' })).toEqual({
      contacts: [],
      socialLinks: [],
    })
  })
})
