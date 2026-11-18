/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Em 18/11/2026 a foto do motorista no painel respondia 401 em staging: as rotas anônimas da foto de perfil e das
 * imagens do e-mail só entravam no ramo sem `companyId`, e a instalação dedicada (a de verdade) devolvia a lista do
 * segundo `return`, sem elas. O roteador manda rota desconhecida para a autenticação — por isso 401, não 404.
 * Este contrato cobra que os dois `return` de `createAnonymousRoutes` as incluam.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const MAIN = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8')

describe('rotas públicas da foto de perfil e do e-mail', () => {
  test('são definidas uma vez e entram nos dois modos de instalação', () => {
    expect(MAIN.match(/createPublicUserPictureRoutes\(\{/gu)?.length).toBe(1)
    expect(MAIN.match(/createPublicMailAssetRoutes\(\{/gu)?.length).toBe(1)
    expect(MAIN.match(/\.\.\.publicIdentityAssetRoutes,/gu)?.length).toBe(2)
  })
})
