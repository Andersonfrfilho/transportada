/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SOCIAL_NETWORKS,
  createCompanyContactsClient,
  formatPhone,
  toPhoneDigits,
} from '@/modules/company-settings/shared/companyContactsClient.service'
import {
  SETTINGS_PANEL_PLACEMENT,
  resolveCompanySettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'

/** Cópia por valor do catálogo da API: mudou lá, mude aqui — o bundle não carrega código dela. */
const API_SOCIAL_NETWORKS = [
  'website',
  'instagram',
  'facebook',
  'linkedin',
  'youtube',
  'tiktok',
  'x',
]

function respondWith(payload: unknown) {
  const requests: Request[] = []
  return {
    client: createCompanyContactsClient({
      apiBaseUrl: 'https://api.exemplo.com.br',
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(
          new Response(JSON.stringify(payload), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
    requests,
  }
}

describe('painel de contatos e redes (spec 068)', () => {
  test('o catálogo de redes é o mesmo dos dois lados', () => {
    expect(COMPANY_SOCIAL_NETWORKS.join(',')).toBe(API_SOCIAL_NETWORKS.join(','))
  })

  test('o painel mora na aba Site, e é ela que liga a consulta', () => {
    expect(SETTINGS_PANEL_PLACEMENT.companyContacts).toEqual({
      module: 'company-settings',
      source: 'companyContacts',
      tab: 'site',
    })
    expect(resolveCompanySettingsDataScope('site').companyContacts).toBe(true)
    expect(resolveCompanySettingsDataScope('company').companyContacts).toBe(false)
  })

  test('a leitura descarta linha sem forma de contato em vez de derrubar a tela', async () => {
    const remote = respondWith({
      data: {
        contacts: [
          { isWhatsapp: true, kind: 'phone', label: 'Vendas', value: '5516999991234' },
          { kind: 'carta-pombo', value: 'nada' },
          { kind: 'email', value: 'contato@exemplo.com.br' },
        ],
        socialLinks: [
          { network: 'instagram', url: 'https://instagram.com/exemplo' },
          { network: 'orkut', url: 'https://orkut.com/exemplo' },
        ],
      },
    })

    const settings = await remote.client.getSettings()

    expect(settings.contacts).toHaveLength(2)
    expect(settings.contacts[0]?.isWhatsapp).toBe(true)
    expect(settings.contacts[1]?.label).toBe('')
    expect(settings.socialLinks).toEqual([
      { network: 'instagram', url: 'https://instagram.com/exemplo' },
    ])
  })

  test('a escrita vai como `PUT` da lista inteira, com o token no cabeçalho', async () => {
    const remote = respondWith({ data: { contacts: [], socialLinks: [] } })

    await remote.client.updateSettings({ contacts: [], socialLinks: [] })

    const [request] = remote.requests
    expect(request?.method).toBe('PUT')
    expect(request?.url).toBe('https://api.exemplo.com.br/company-settings/contacts')
    expect(request?.headers.get('authorization')).toBe('Bearer token')
  })

  /** A máscara é da tela; o banco guarda dígito. As duas direções vivem no mesmo serviço. */
  test('o telefone vira dígito para o servidor e máscara para a tela', () => {
    expect(toPhoneDigits('(16) 3333-4444')).toBe('1633334444')
    expect(formatPhone('1633334444')).toBe('(16) 3333-4444')
    expect(formatPhone('5516999991234')).toBe('(16) 99999-1234')
    /* Fora das medidas conhecidas sai como veio — melhor cru do que mascarado errado. */
    expect(formatPhone('123')).toBe('123')
  })
})
