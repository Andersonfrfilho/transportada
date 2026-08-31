/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readInstallationBrand } from '../../src/modules/identity/shared/installationBrand.service'
import { buildContentSecurityPolicy } from '../../src/modules/shared/contentSecurityPolicy.service'

const API_URL = 'https://api.exemplo.com.br'

function clientOf(respond: (url: string) => Response) {
  return {
    apiUrl: API_URL,
    fetch: ((input: URL | RequestInfo) =>
      Promise.resolve(
        respond(input instanceof Request ? input.url : String(input)),
      )) as typeof globalThis.fetch,
  }
}

/**
 * Cada deploy é de uma transportadora só (ADR-0021), então "a empresa" não é ambígua nesta tela. A
 * marca vem das rotas **públicas que já existem** — as mesmas do site institucional: uma rota nova
 * só para isto acrescentaria superfície anônima para servir exatamente o mesmo byte.
 */
describe('a marca da instalação na tela de entrar', () => {
  test('lê o nome da transportadora e monta a URL do logotipo', async () => {
    const brand = await readInstallationBrand(
      clientOf(() => Response.json({ data: { brandName: 'Fernandes Transportadora' } })),
    )

    expect(brand.name).toBe('Fernandes Transportadora')
    expect(brand.logoUrl).toBe(`${API_URL}/public/landing-logo`)
  })

  /** Instalação recém-provisionada não tem marca: a tela cai no nome do produto, e não em branco. */
  test('nome em branco é ausência, não string vazia na tela', async () => {
    const brand = await readInstallationBrand(
      clientOf(() => Response.json({ data: { brandName: '   ' } })),
    )

    expect(brand.name).toBeNull()
  })

  /**
   * Falha e ausência dão no mesmo. Segurar quem quer entrar porque a consulta da marca caiu seria
   * trocar um enfeite por um bloqueio — e ela acontece antes de qualquer autenticação.
   */
  test('API fora do ar não impede a tela de existir', async () => {
    const brand = await readInstallationBrand({
      apiUrl: API_URL,
      fetch: (() => Promise.reject(new Error('rede'))) as typeof globalThis.fetch,
    })

    expect(brand.name).toBeNull()
    expect(brand.logoUrl).toBe(`${API_URL}/public/landing-logo`)
  })

  test('resposta sem o formato esperado não vira nome inventado', async () => {
    const brand = await readInstallationBrand(clientOf(() => Response.json({ data: 'nada disso' })))

    expect(brand.name).toBeNull()
  })
})

/**
 * `<img>` de origem cruzada é governado por `img-src`, não por `connect-src`. Sem a origem da API
 * ali, o logotipo é bloqueado **depois** de baixado — e a tela mostra o ícone quebrado sem dizer
 * por quê, que foi exatamente o que aconteceu com a foto de perfil.
 */
describe('a diretiva deixa o logotipo carregar', () => {
  const policy = buildContentSecurityPolicy({
    allowsInlineScript: false,
    apiBaseUrl: API_URL,
    keycloakUrl: 'https://identidade.exemplo.com.br',
  })
  const imgSource = policy
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('img-src'))

  test('a origem da API entra em img-src', () => {
    expect(imgSource).toContain(API_URL)
    expect(imgSource).toContain('blob:')
  })

  /** O provedor de identidade não serve imagem nossa: origem que ninguém usa é permissão de graça. */
  test('e só ela: o provedor de identidade fica de fora', () => {
    expect(imgSource).not.toContain('identidade.exemplo.com.br')
  })
})
