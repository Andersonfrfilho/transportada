/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME = 'deploy/keycloak/theme/login/'

function repositoryFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT)).text()
}

/**
 * A tela de senha do Keycloak dizia "TransportAdA": o nome vinha do `displayName` do realm, digitado
 * à mão, enquanto nome e logo da transportadora já moram na API. O tema passa a lê-los de lá — sem
 * piscar: a marca da última visita é aplicada antes da primeira pintura.
 */
describe('a tela de senha do Keycloak mostra a transportadora da API', () => {
  test('o template reserva a marca e carrega o script sem defer, logo depois dela', async () => {
    const template = await repositoryFile(`${THEME}template.ftl`)
    const properties = await repositoryFile(`${THEME}theme.properties`)

    expect(properties).toContain('brandApiOrigin=${env.KEYCLOAK_BRAND_API_ORIGIN}')
    expect(template).toContain('brandApiOrigin?starts_with("http")')
    expect(template).toContain('data-brand-api="${brandApiOrigin}"')
    expect(template).toContain(' brand-pending')
    expect(template).toMatch(
      /<script src="\$\{url\.resourcesPath\}\/js\/installation-brand\.js\?v=\$\{resourcesVersion\}"><\/script>/u,
    )
    expect(template).not.toMatch(/installation-brand\.js[^>]*defer/u)
  })

  test('o script lê a marca guardada antes da API e não a apaga quando a API falha', async () => {
    const script = await repositoryFile(`${THEME}resources/js/installation-brand.js`)

    expect(script).toContain("'/public/landing-settings'")
    expect(script).toContain("'/public/landing-logo'")
    expect(script.indexOf('var cached = readStorage()')).toBeLessThan(
      script.indexOf('fetch(apiOrigin'),
    )
    expect(script).toContain('if (!cached) render(')
    expect(script).toContain("credentials: 'omit'")
  })

  /** "TAPETE MAGICO TRANSPORTADORA" no corpo de "TransportAdA" corria por baixo do formulário. */
  test('nome longo desce de corpo em vez de invadir o painel', async () => {
    const css = await repositoryFile(`${THEME}resources/css/login.css`)
    const script = await repositoryFile(`${THEME}resources/js/installation-brand.js`)

    expect(css).toContain('.brand-length-long .brand-wordmark')
    expect(css).toContain('.brand-length-very-long .brand-wordmark')
    expect(css).toContain('.brand-pending .brand-wordmark')
    expect(script).toContain("'brand-length-very-long'")
  })
})
