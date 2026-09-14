/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME_LOGIN = 'deploy/keycloak/theme/login/login.ftl'
const THEME_PROPERTIES = 'deploy/keycloak/theme/login/theme.properties'
const THEME_APPLICATION_LINKS = 'deploy/keycloak/theme/login/resources/js/password-reset-link.js'
const THEME_MESSAGE_BUNDLES = [
  'deploy/keycloak/theme/login/messages/messages_en.properties',
  'deploy/keycloak/theme/login/messages/messages_pt_BR.properties',
] as const

const IDENTIFIED_BRANCH = '<#if identifiedUsername?has_content>'
const TYPED_USERNAME_FIELD = '<label class="field" for="username">'

function repositoryFile(filePath: string) {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT))
}

/** Os dois ramos do campo de usuário: o de quem a tela do app já identificou, e o de sempre. */
async function readUsernameBranches(): Promise<{ identified: string; typed: string }> {
  const login = await repositoryFile(THEME_LOGIN).text()
  const start = login.indexOf(IDENTIFIED_BRANCH)
  const typedStart = login.indexOf(TYPED_USERNAME_FIELD, start)
  const typedEnd = login.indexOf('</label>', typedStart)
  if (start === -1 || typedStart === -1 || typedEnd === -1) {
    throw new Error('login.ftl sem o ramo de usuário identificado')
  }
  return { identified: login.slice(start, typedStart), typed: login.slice(typedStart, typedEnd) }
}

/**
 * A tela do app pergunta qualquer contato cadastrado e resolve quem é; o Keycloak recebe o username
 * por `login_hint`. Pedir o usuário de novo aqui é perguntar duas vezes — e, pior, num campo que
 * não aceita o CPF ou o telefone que a pessoa acabou de digitar.
 */
describe('login theme password only contract', () => {
  test('derives the identified user from the username the provider already filled', async () => {
    const login = await repositoryFile(THEME_LOGIN).text()

    expect(login).toContain("<#assign identifiedUsername = (login.username)!''>")
    expect(login).toContain(IDENTIFIED_BRANCH)
  })

  test('with the user identified, asks only for the password and posts the username hidden', async () => {
    const { identified } = await readUsernameBranches()

    expect(identified).toContain(
      '<input id="username" name="username" type="hidden" value="${identifiedUsername}" />',
    )
    expect(identified).not.toContain('type="text"')
    expect(identified).toContain('${identifiedUsername}</strong>')
  })

  test('with the user identified, offers the way back to the application identifier screen', async () => {
    const { identified } = await readUsernameBranches()

    expect(identified).toContain('data-identity-restart')
    expect(identified).toContain('${msg("transportadaNotYou")}')
    // A URL do app vem da configuração do deploy, nunca cravada por ambiente.
    expect(identified).toContain('applicationOrigin?starts_with("http")')
    expect(identified).not.toMatch(/https?:\/\/[a-z]/i)
  })

  test('without a user, the screen keeps the username and password fields', async () => {
    const { typed } = await readUsernameBranches()

    expect(typed).toContain('id="username" name="username"')
    expect(typed).toContain('type="text"')
  })

  /** Sem a variável o Keycloak deixa o literal `${env.…}`: por isso o template testa `http`. */
  test('reads the application origin from the deployment', async () => {
    const properties = await repositoryFile(THEME_PROPERTIES).text()

    expect(properties).toContain('applicationOrigin=${env.KEYCLOAK_FRONTEND_ORIGIN}')
  })

  test('falls back to the redirect_uri origin when the deployment says nothing', async () => {
    const script = await repositoryFile(THEME_APPLICATION_LINKS).text()

    expect(script).toContain('[data-identity-restart]')
    expect(script).toContain("get('redirect_uri')")
  })

  test('says it in both message bundles', async () => {
    const bundles = await Promise.all(
      THEME_MESSAGE_BUNDLES.map((bundle) => repositoryFile(bundle).text()),
    )

    for (const bundle of bundles) {
      expect(bundle).toContain('transportadaNotYou=Não é você?\n')
      expect(bundle).toContain('transportadaIdentifiedAs=Entrando como\n')
    }
  })
})
