/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

describe('os cabeçalhos do portal (spec 063 T009)', () => {
  /**
   * O portal não bipa etiqueta, não rastreia ninguém e não grava áudio: as três capacidades são
   * negadas. Este contrato existe para que ligar qualquer uma delas seja uma decisão escrita, e não
   * uma linha copiada do painel — onde a câmera **precisa** estar aberta, para o separador.
   */
  test('nega câmera, posição e microfone', async () => {
    const server = await readFile('server.ts', 'utf8')

    expect(server).toContain("'Permissions-Policy': 'camera=(), geolocation=(), microphone=()'")
  })

  /** O servidor não sobe sem a diretiva: publicar sem cabeçalho é a falha que não quebra nada visível. */
  test('recusa subir sem a CSP emitida no build', async () => {
    const server = await readFile('server.ts', 'utf8')

    expect(server).toContain('FRONTEND_MISSING_CONTENT_SECURITY_POLICY')
    expect(server).toContain('FRONTEND_EMPTY_CONTENT_SECURITY_POLICY')
  })

  /** Sem bypass de autenticação: um atalho desses num app externo é o que ninguém quer ligado. */
  test('o provedor de autenticação não tem atalho de smoke', async () => {
    const provider = await readFile('src/modules/shared/KeycloakAuthProvider.provider.ts', 'utf8')

    expect(provider).not.toContain('isSmokeAuthBypassEnabled')
    expect(provider).not.toContain('smoke-access-token')
  })
})
