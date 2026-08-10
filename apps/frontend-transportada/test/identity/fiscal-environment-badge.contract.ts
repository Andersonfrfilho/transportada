/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { isAuthMeResponse } from '../../src/modules/identity/queries/useAuthMe.query'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** A fonte da verdade do ambiente é a API; o frontend só reflete o que ela responde. */
const API_AUTH_ME_SOURCE = new URL(
  '../../../api-transportada/src/http/router.service.ts',
  import.meta.url,
)

function authMeBody(company: Record<string, unknown>): unknown {
  return {
    data: {
      company,
      identity: { userId: '00000000-0000-4000-8000-000000000003' },
      permissions: ['invoices.read'],
      roles: ['viewer'],
    },
  }
}

function readEntrypoint(): Promise<string> {
  return Bun.file(new URL('src/main.tsx', APPLICATION_ROOT)).text()
}

describe('fiscal environment badge contract', () => {
  /**
   * O selo de ambiente é o aviso de que a emissão vale de verdade. Enquanto foi literal ele mentia
   * das duas formas: dizia homologação para quem já estava em produção — o caso relatado — e diria
   * a mesma coisa se a empresa voltasse para homologação, sem ninguém perceber a diferença.
   */
  test('o cabeçalho não carrega ambiente fiscal escrito à mão', async () => {
    const entrypoint = await readEntrypoint()

    expect(entrypoint).not.toContain('<span>Homologação</span>')
    expect(entrypoint).toContain('fiscalEnvironment')
  })

  test('o ambiente da empresa é lido do /auth/me', () => {
    expect(isAuthMeResponse(authMeBody({ fiscalEnvironment: 'production', id: 'company' }))).toBe(
      true,
    )
    expect(isAuthMeResponse(authMeBody({ fiscalEnvironment: 'homologation', id: 'company' }))).toBe(
      true,
    )
  })

  /** Empresa sem cadastro fiscal ainda não tem ambiente: `null` é resposta válida, e a tela não inventa selo. */
  test('ausência de cadastro fiscal é um ambiente nulo, não um erro de contrato', () => {
    expect(isAuthMeResponse(authMeBody({ fiscalEnvironment: null, id: 'company' }))).toBe(true)
  })

  test('valor de ambiente fora do contrato derruba a resposta inteira', () => {
    expect(isAuthMeResponse(authMeBody({ fiscalEnvironment: 'producao', id: 'company' }))).toBe(
      false,
    )
  })

  /**
   * API mais velha que o frontend não pode derrubar a tela inteira por causa de um selo: sem o
   * campo o cabeçalho fica sem selo e o resto continua de pé. A deriva quem pega é o teste que
   * lê a fonte da API, não o usuário.
   */
  test('resposta sem o campo continua válida — o selo some, a tela não', () => {
    expect(isAuthMeResponse(authMeBody({ id: 'company' }))).toBe(true)
  })

  /** Sem esta amarra a API pode parar de mandar o campo e a tela some com o selo em silêncio. */
  test('a API continua devolvendo o ambiente fiscal no /auth/me', async () => {
    const source = await Bun.file(API_AUTH_ME_SOURCE).text()

    expect(source).toContain('fiscalEnvironment')
  })
})
