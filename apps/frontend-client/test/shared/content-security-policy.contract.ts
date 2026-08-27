/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  EXTERNAL_CONNECT_ORIGIN,
  NON_FETCH_ORIGIN,
  buildContentSecurityPolicy,
} from '../../src/modules/shared/contentSecurityPolicy.service'

const ORIGINS = {
  apiBaseUrl: 'https://api.exemplo.test',
  keycloakUrl: 'https://auth.exemplo.test',
}

describe('a CSP do portal do contratante (spec 063 T009)', () => {
  /**
   * ADR-0050 §1: a separação é de segurança, e ela aparece aqui — o portal **não tem destino externo
   * nenhum**. Toda origem que entrasse seria um terceiro sabendo que uma carga daquele cliente está
   * em trânsito.
   */
  test('não declara destino externo', () => {
    expect(EXTERNAL_CONNECT_ORIGIN).toEqual([])

    const policy = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })
    const connectSource = policy
      .split('; ')
      .find((directive) => directive.startsWith('connect-src '))

    expect(connectSource).toBe(
      "connect-src 'self' https://api.exemplo.test https://auth.exemplo.test",
    )
  })

  /** Sem `iframe` e sem imagem remota: o mapa é desenho nosso, e nada de terceiro renderiza aqui. */
  test('fecha frame e imagem de terceiro', () => {
    const policy = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })

    expect(policy).toContain("frame-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("img-src 'self'")
    expect(policy).toContain("object-src 'none'")
  })

  /** `'unsafe-inline'` existe **só** em `style-src`, e o script inline só no servidor de dev. */
  test('não permite script inline no bundle servido', () => {
    const served = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: false })
    const development = buildContentSecurityPolicy({ ...ORIGINS, allowsInlineScript: true })

    expect(served).toContain("script-src 'self'")
    expect(served).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(development).toContain("script-src 'self' 'unsafe-inline'")
  })

  /**
   * A varredura é o que impede a diretiva de envelhecer calada: origem nova no código sem entrada no
   * `connect-src` seria descoberta pelo cliente, no celular dele, com o console fechado.
   */
  test('nenhuma origem https no código está fora da diretiva', async () => {
    const declared = new Set<string>([...EXTERNAL_CONNECT_ORIGIN, ...NON_FETCH_ORIGIN])
    const files = await listSourceFiles('src')

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(/https:\/\/[a-z0-9.-]+/gu)) {
        const origin = match[0]
        /** O comentário cita as origens do painel para explicar a diferença — não é destino daqui. */
        if (file.endsWith('contentSecurityPolicy.service.ts')) continue
        expect(declared.has(origin)).toBe(true)
      }
    }
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
