/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `redirectUris` não era gerenciado por lugar nenhum, e o portal do contratante nasceu sem login:
 * o Keycloak recusou com `Invalid parameter: redirect_uri` e nada no repositório dizia que faltava.
 * O arquivo conserta isso — e este contrato existe para ele não envelhecer do mesmo jeito.
 *
 * O que se guarda aqui é o que a máquina consegue afirmar sem falar com o Keycloak: que os dois
 * ambientes estão declarados, que toda app com login tem callback nos dois, e que o formato é o que
 * o Keycloak aceita. Se as URLs correspondem ao que está no ar, só o próprio `keycloak-reconcile.sh`
 * responde — e ele confere depois de escrever.
 */
import { describe, expect, test } from 'bun:test'

const REDIRECT_URIS_PATH = new URL('../../../../realm/spa-redirect-uris.json', import.meta.url)
  .pathname
const RECONCILE_PATH = new URL('../../../../.github/scripts/keycloak-reconcile.sh', import.meta.url)
  .pathname

const ENVIRONMENTS = ['production', 'staging'] as const
const SPA_CLIENT = 'transportada-spa'
const CALLBACK_SUFFIX = '/auth/callback'

/** As duas apps que autenticam: o painel e o portal do contratante (ADR-0050 §1). */
const AUTHENTICATED_APPS = ['app.', 'cliente.'] as const

type ClientRedirects = Readonly<{
  redirectUris: readonly string[]
  webOrigins: readonly string[]
}>

async function readDeclaration(): Promise<
  Readonly<Record<string, Record<string, ClientRedirects>>>
> {
  return (await Bun.file(REDIRECT_URIS_PATH).json()) as Readonly<
    Record<string, Record<string, ClientRedirects>>
  >
}

describe('callbacks OAuth declarados por ambiente', () => {
  test('os dois ambientes declaram o client SPA', async () => {
    const declaration = await readDeclaration()

    for (const environment of ENVIRONMENTS) {
      expect(declaration[environment]?.[SPA_CLIENT]).toBeDefined()
    }
  })

  /**
   * Painel e portal são bundles separados servidos de origens diferentes: cada um precisa do
   * callback dele. Esquecer o do portal foi exatamente o defeito que este arquivo conserta.
   */
  test('painel e portal têm callback nos dois ambientes', async () => {
    const declaration = await readDeclaration()

    for (const environment of ENVIRONMENTS) {
      const uris = declaration[environment]?.[SPA_CLIENT]?.redirectUris ?? []
      for (const app of AUTHENTICATED_APPS) {
        expect(uris.some((uri) => uri.includes(app))).toBe(true)
      }
    }
  })

  /** O Keycloak casa a URL inteira: caminho errado recusa igual a domínio errado. */
  test('todo callback é https e termina no caminho que o cliente usa', async () => {
    const declaration = await readDeclaration()

    for (const environment of ENVIRONMENTS) {
      for (const uri of declaration[environment]?.[SPA_CLIENT]?.redirectUris ?? []) {
        expect(uri.startsWith('https://')).toBe(true)
        expect(uri.endsWith(CALLBACK_SUFFIX)).toBe(true)
      }
    }
  })

  /** Origem é só o esquema e o host — barra no fim ou caminho fazem o CORS do Keycloak não casar. */
  test('toda origem é https e não tem caminho', async () => {
    const declaration = await readDeclaration()

    for (const environment of ENVIRONMENTS) {
      for (const origin of declaration[environment]?.[SPA_CLIENT]?.webOrigins ?? []) {
        expect(origin).toBe(new URL(origin).origin)
        expect(origin.startsWith('https://')).toBe(true)
      }
    }
  })

  /**
   * Acrescentar e nunca remover é a decisão que impede este script de derrubar o login de produção
   * quando o arquivo esquecer um callback que só existe no painel. Guardada por texto de fonte
   * porque uma troca para `redirectUris: $wanted.redirectUris` compilaria e passaria em todo teste
   * de caminho feliz — e só falharia no ar, na tela de entrar.
   */
  test('a reconciliação faz união com o que já está cadastrado', async () => {
    const script = await Bun.file(RECONCILE_PATH).text()

    expect(script).toContain('$wanted.redirectUris | unique')
    expect(script).toContain('$wanted.webOrigins | unique')
  })
})
