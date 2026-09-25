/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  EXTERNAL_CONNECT_ORIGIN,
  NON_FETCH_ORIGIN,
  buildContentSecurityPolicy,
} from '../../src/modules/shared/contentSecurityPolicy.service'

const SOURCE_DIRECTORY = new URL('../../src', import.meta.url).pathname
const ORIGINS = {
  apiBaseUrl: 'https://api.exemplo.test/v1',
  keycloakUrl: 'https://auth.exemplo.test',
}

function readDirective(policy: string, name: string): string | undefined {
  return policy.split('; ').find((directive) => directive.startsWith(`${name} `))
}

describe('a CSP da app do motorista (ADR-0075 §4)', () => {
  /**
   * O motorista fala com a própria origem, a API e o Keycloak — e mais ninguém. O sino também sai
   * pela API, então não abre origem nova. Terceiro que entrasse aqui saberia por onde a carga anda.
   */
  test('connect-src tem só a própria origem, a API e o Keycloak', () => {
    const policy = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })

    expect(EXTERNAL_CONNECT_ORIGIN).toEqual([])
    expect(readDirective(policy, 'connect-src')).toBe(
      "connect-src 'self' https://api.exemplo.test https://auth.exemplo.test",
    )
  })

  /**
   * `blob:` é a prévia da foto e do recorte; a origem da API é o logo da instalação. A origem do
   * armazenamento chega com a spec 179, e não antes.
   */
  test("img-src é 'self', blob: e a origem da API", () => {
    const policy = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })

    expect(readDirective(policy, 'img-src')).toBe("img-src 'self' blob: https://api.exemplo.test")
  })

  /** O `sw.ts` e o manifesto são da própria origem — é o que a spec 147 encontra pronto. */
  test('worker e manifesto só da própria origem, e nada de frame', () => {
    const policy = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })

    expect(policy).toContain("worker-src 'self'")
    expect(policy).toContain("manifest-src 'self'")
    expect(policy).toContain("frame-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
  })

  test('não permite script inline no bundle servido', () => {
    const served = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })
    const development = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: true })

    expect(readDirective(served, 'script-src')).toBe("script-src 'self'")
    expect(readDirective(development, 'script-src')).toBe("script-src 'self' 'unsafe-inline'")
  })

  /** Sem a API e o Keycloak declarados (CI sem `.env`), a diretiva fecha em `'self'`, não abre. */
  test('origem ausente não abre a diretiva', () => {
    const policy = buildContentSecurityPolicy({
      allowsInlineScript: false,
      apiBaseUrl: undefined,
      keycloakUrl: undefined,
    })

    expect(readDirective(policy, 'connect-src')).toBe("connect-src 'self'")
    expect(readDirective(policy, 'img-src')).toBe("img-src 'self' blob:")
  })

  /**
   * A varredura impede a diretiva de envelhecer calada: origem nova no código sem entrada aqui
   * seria descoberta pelo motorista, no celular, com o console fechado. Origem que só se abre por
   * `window.open` (mapa, XML assinado) vai para `NON_FETCH_ORIGIN`, com o motivo escrito.
   */
  test('nenhuma origem https no código está fora das listas', async () => {
    const declared = new Set<string>([...EXTERNAL_CONNECT_ORIGIN, ...NON_FETCH_ORIGIN])
    const files = await listSourceFiles(SOURCE_DIRECTORY)
    const undeclared: string[] = []

    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/https:\/\/[a-z0-9.-]+/gu)) {
        if (!declared.has(match[0])) undeclared.push(`${file}: ${match[0]}`)
      }
    }

    expect(undeclared).toEqual([])
  })
})

async function listSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(path)))
      continue
    }
    if (/\.(css|json|ts|tsx)$/u.test(entry.name)) files.push(path)
  }

  return files
}
