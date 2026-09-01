/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  EXTERNAL_CONNECT_ORIGIN,
  NON_FETCH_ORIGIN,
  buildContentSecurityPolicy,
} from '../../src/modules/shared/contentSecurityPolicy.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_BASE_URL = 'https://api.exemplo.com.br'
const ORIGIN_PATTERN = /https:\/\/[a-z0-9.-]+/gu
/** O arquivo que declara a diretiva nomeia toda origem dela: contá-lo faria a varredura se auto-provar. */
const DECLARATION_PATH = 'modules/shared/contentSecurityPolicy.service.ts'

const SERVED_POLICY = buildContentSecurityPolicy({
  allowsInlineScript: false,
  apiBaseUrl: API_BASE_URL,
})

function directiveOf(policy: string, name: string): string {
  const directive = policy.split('; ').find((entry) => entry.startsWith(`${name} `))
  if (directive === undefined) {
    throw new Error(`CONTENT_SECURITY_POLICY_MISSING_DIRECTIVE_${name}`)
  }
  return directive
}

/**
 * A diretiva não se descobre por lista escrita à mão: quem procura os destinos é o teste, varrendo o
 * que o bundle realmente nomeia. Endereço novo em qualquer módulo cai aqui, e a única saída é
 * decidir — entra no `connect-src` ou entra em `NON_FETCH_ORIGIN` como origem que nunca é buscada.
 */
async function collectSourceOrigins(
  input: Readonly<{ skipsDeclaration: boolean }> = { skipsDeclaration: false },
): Promise<readonly string[]> {
  const origins = new Set<string>()
  const glob = new Bun.Glob('**/*.{ts,tsx,css,json}')

  for await (const relativePath of glob.scan({
    cwd: fileURLToPath(new URL('src', APPLICATION_ROOT)),
  })) {
    if (input.skipsDeclaration && relativePath === DECLARATION_PATH) continue
    const content = await Bun.file(
      fileURLToPath(new URL(`src/${relativePath}`, APPLICATION_ROOT)),
    ).text()

    for (const match of content.matchAll(ORIGIN_PATTERN)) {
      origins.add(match[0].replace(/\.$/u, ''))
    }
  }

  return [...origins].sort()
}

describe('logo servido pela API', () => {
  /**
   * A landing desenha a marca da transportadora com `<img src="{API}/public/landing-logo">`. Sem a
   * origem da API em `img-src`, o navegador bloqueia a imagem e o site cai no nome genérico do
   * produto — foi o que aconteceu em produção em 01/09/2026, com a API respondendo 200.
   */
  test('img-src admite a origem da API, não só a própria', () => {
    const directive = directiveOf(SERVED_POLICY, 'img-src')

    expect(directive).toContain(API_BASE_URL)
    expect(directive).toContain("'self'")
  })

  test('sem API configurada, img-src fica só com a própria origem', () => {
    const policy = buildContentSecurityPolicy({ allowsInlineScript: false, apiBaseUrl: undefined })

    expect(directiveOf(policy, 'img-src')).toBe("img-src 'self'")
  })
})

describe('content security policy', () => {
  test('carries every external origin the bundle names, or declares it as never fetched', async () => {
    const connectSource = directiveOf(SERVED_POLICY, 'connect-src')
    const sourceOrigins = await collectSourceOrigins()

    for (const origin of sourceOrigins) {
      const isDeclared =
        connectSource.includes(origin) || (NON_FETCH_ORIGIN as readonly string[]).includes(origin)
      expect(`${origin}:${isDeclared}`).toBe(`${origin}:true`)
    }
  })

  test('carries no origin the bundle stopped fetching', async () => {
    const namedOrigins = await collectSourceOrigins({ skipsDeclaration: true })

    for (const origin of EXTERNAL_CONNECT_ORIGIN as readonly string[]) {
      const isNamed = namedOrigins.some((named) => named === origin)
      expect(`${origin}:${isNamed}`).toBe(`${origin}:true`)
    }
  })

  test('carries the api origin, without the path', () => {
    const connectSource = directiveOf(SERVED_POLICY, 'connect-src')

    expect(connectSource).toContain(API_BASE_URL)
  })

  test('forbids frames from anywhere but the Turnstile challenge', () => {
    expect(SERVED_POLICY).toContain('frame-src https://challenges.cloudflare.com')
    expect(SERVED_POLICY).toContain("frame-ancestors 'none'")
    expect(SERVED_POLICY).toContain("object-src 'none'")
  })

  test('never relaxes script execution in what is served, beyond the Turnstile widget', () => {
    expect(directiveOf(SERVED_POLICY, 'script-src')).toBe(
      "script-src 'self' https://challenges.cloudflare.com",
    )
    expect(SERVED_POLICY).not.toContain('unsafe-eval')
    expect(SERVED_POLICY).toContain("default-src 'self'")
  })

  test('relaxes inline only for style, and inline script only for the dev server', () => {
    expect(directiveOf(SERVED_POLICY, 'style-src')).toBe("style-src 'self' 'unsafe-inline'")
    expect(
      directiveOf(
        buildContentSecurityPolicy({ allowsInlineScript: true, apiBaseUrl: API_BASE_URL }),
        'script-src',
      ),
    ).toBe("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com")
  })

  test('survives the quality job, which builds without any environment file', () => {
    const policy = buildContentSecurityPolicy({ allowsInlineScript: false, apiBaseUrl: undefined })

    expect(directiveOf(policy, 'connect-src')).toBe(
      "connect-src 'self' https://challenges.cloudflare.com",
    )
  })

  test('refuses a declared origin it cannot read, instead of shipping a narrower directive', () => {
    expect(() =>
      buildContentSecurityPolicy({ allowsInlineScript: false, apiBaseUrl: 'api.exemplo.com.br' }),
    ).toThrow()
  })
})
