/* Copyright (c) 2026 Ada Technology. MIT License. */
import { runInNewContext } from 'node:vm'

import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME_LOGIN = 'deploy/keycloak/theme/login/login.ftl'
const THEME_STYLES = 'deploy/keycloak/theme/login/resources/css/login.css'
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

type ThemeLink = { hidden: boolean; href: string; dataset: Record<string, string> }

/** Roda o script do tema de verdade, sobre um `document` mínimo com os dois links do `login.ftl`. */
async function runApplicationLinksScript(
  search: string,
): Promise<{ restart: ThemeLink; reset: ThemeLink }> {
  const source = await repositoryFile(THEME_APPLICATION_LINKS).text()
  const restart: ThemeLink = { hidden: true, href: '#', dataset: {} }
  const reset: ThemeLink = { hidden: true, href: '#', dataset: {} }
  const links: Record<string, ThemeLink> = {
    '[data-identity-restart]': restart,
    '[data-password-reset]': reset,
  }
  const document = {
    readyState: 'complete',
    querySelector: (selector: string) => links[selector] ?? null,
  }

  runInNewContext(source, {
    window: { location: { search } },
    document,
    URL,
    URLSearchParams,
    atob,
  })
  return { restart, reset }
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
    expect(identified).toContain('${msg("transportadaSwitchUser")}')
    // A URL do app vem da configuração do deploy, nunca cravada por ambiente.
    expect(identified).toContain('applicationOrigin?starts_with("http")')
    expect(identified).not.toMatch(/https?:\/\/[a-z]/i)
  })

  /**
   * O `redirect_uri` diz de onde a pessoa veio — painel ou portal. `applicationOrigin` é variável
   * fixa do deploy: se ela decidisse o destino, um realm com as duas apps mandaria todo mundo de
   * volta para um único lugar, errando para quem entrou pelo outro. Por isso o link nasce **sempre**
   * escondido, sem `href` vindo da variável — só o script decide o destino, com o `redirect_uri` na
   * frente e a variável como reserva.
   */
  test('the restart link never gets its href from the deployment variable directly', async () => {
    const { identified } = await readUsernameBranches()

    expect(identified).toContain('data-identity-restart hidden href="#"')
    expect(identified).toContain('data-fallback-origin="${applicationOrigin}"')
    expect(identified).not.toContain('href="${applicationOrigin}')
  })

  /**
   * Quem digitou o usuário de outra pessoa costuma descobrir pela senha recusada — e era justamente a
   * tela de erro que perdia a saída. Ela é **texto** na linha do usuário ("Não é você? Trocar de
   * usuário"), e não botão: a tela tem uma ação só, o "Entrar". O `loginRestartFlowUrl` não serve de
   * destino: o restart guarda o `login_hint` e devolve a mesma tela, com o mesmo usuário (medido no
   * Keycloak 26.5.2).
   */
  test('switching user is a text link on the identified user line, never a button', async () => {
    const { identified } = await readUsernameBranches()
    const switchStart = identified.indexOf(
      '<a class="identified-user-switch" data-identity-restart',
    )
    const switchLink = identified.slice(switchStart, identified.indexOf('</a>', switchStart))

    expect(switchStart).toBeGreaterThan(-1)
    expect(switchLink).not.toContain('action')
    expect(switchLink).not.toContain('<svg')
    expect(identified).toContain('${msg("transportadaNotYou")}')
    expect(identified).not.toContain('${url.loginRestartFlowUrl}')
  })

  /** Link sem moldura ainda precisa de 44px de toque no celular, e o sublinhado marca foco e hover. */
  test('the text link keeps a touch target and the theme accent', async () => {
    const css = await repositoryFile(THEME_STYLES).text()
    const rule = css.slice(
      css.indexOf('.identified-user-switch {'),
      css.indexOf('}', css.indexOf('.identified-user-switch {')),
    )

    expect(rule).toContain('color: var(--transportada-copper)')
    expect(rule).toContain('min-height: 2.75rem')
    expect(rule).not.toContain('border:')
    expect(css).toContain('.identified-user-switch:focus-visible')
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

  /**
   * `redirect_uri` tem precedência sobre a variável fixa do deploy: só quando ele falta (ou não é
   * uma URL válida) é que o script lê o `data-fallback-origin` de cada link. A variável nunca vira o
   * `href` direto no `.ftl` (contrato anterior) — o script é o único que decide.
   */
  test('reads redirect_uri before falling back to the deployment variable', async () => {
    const script = await repositoryFile(THEME_APPLICATION_LINKS).text()

    const redirectUriIndex = script.indexOf("get('redirect_uri')")
    const fallbackOriginIndex = script.indexOf('fallbackOrigin')

    expect(redirectUriIndex).toBeGreaterThan(-1)
    expect(fallbackOriginIndex).toBeGreaterThan(-1)
    expect(redirectUriIndex).toBeLessThan(fallbackOriginIndex)
  })

  /**
   * Senha errada reenvia o formulário para `login-actions/authenticate`, cuja URL não traz
   * `redirect_uri` — só o `client_data` (base64url de `{"ru": …}`) que o Keycloak 26 acrescenta.
   * Sem lê-lo, o botão sumia exatamente na tela em que a pessoa percebe que errou de usuário.
   */
  test('after a refused password, reveals the switch from the client_data redirect', async () => {
    const clientData = Buffer.from(
      JSON.stringify({ ru: 'https://painel.example.test/auth/callback', rt: 'code' }),
    ).toString('base64url')

    const links = await runApplicationLinksScript(
      `?execution=x&client_id=transportada-spa&tab_id=y&client_data=${clientData}`,
    )

    expect(links.restart.hidden).toBe(false)
    expect(links.restart.href).toBe('https://painel.example.test/')
    expect(links.reset.hidden).toBe(false)
    expect(links.reset.href).toBe('https://painel.example.test/recuperar-senha')
  })

  test('keeps the switch hidden when neither the request nor the deployment names an origin', async () => {
    const links = await runApplicationLinksScript('?client_data=not-json')

    expect(links.restart.hidden).toBe(true)
    expect(links.restart.href).toBe('#')
  })

  test('says it in both message bundles', async () => {
    const bundles = await Promise.all(
      THEME_MESSAGE_BUNDLES.map((bundle) => repositoryFile(bundle).text()),
    )

    for (const bundle of bundles) {
      expect(bundle).toContain('transportadaSwitchUser=Trocar de usuário\n')
      expect(bundle).toContain('transportadaNotYou=Não é você?\n')
      expect(bundle).toContain('transportadaIdentifiedAs=Entrando como\n')
    }
  })
})
