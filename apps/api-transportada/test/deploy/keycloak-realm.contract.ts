/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RECONCILE_SCRIPT = new URL(
  '../../../../.github/scripts/keycloak-reconcile.sh',
  import.meta.url,
)
const DEPLOY_WORKFLOW_PATH = new URL('../../../../.github/workflows/deploy.yml', import.meta.url)
const REALM_PATH = new URL('../../../../deploy/keycloak/realm.json', import.meta.url)

const REALM = 'transportada'
const LOGIN_THEME = 'transportada'
const ADMIN_TOKEN = 'token-de-mentira'

/** A CLI só é consultada por variáveis aqui: o script tira daí endereço e segredo. */
function buildRailwayStub(baseUrl: string): string {
  return `#!/usr/bin/env bash
case "$1" in
  variables) echo '{"KC_HOSTNAME":"${baseUrl}","KEYCLOAK_ADMIN_CLIENT_SECRET":"segredo-de-mentira"}' ;;
  *) echo "stub: comando inesperado: $*" >&2; exit 127 ;;
esac
`
}

type FakeKeycloak = {
  readonly baseUrl: string
  readonly stop: () => Promise<void>
  /** O que foi escrito de tema. Continua só de tema: os dois ajustes são independentes. */
  readonly writes: string[]
  /** O que foi escrito de permissão de troca de login, na ordem em que chegou. */
  readonly usernameWrites: boolean[]
  loginThemeInHtml: string | undefined
  storedLoginTheme: string | undefined
}

/**
 * Dois fatos independentes, e é essa independência que o contrato explora: o que o realm **diz** ter
 * de tema, e o que a página de login **serve**. Um deploy sem o tema na imagem tem o primeiro sem o
 * segundo, e foi exatamente esse par que ficou quatro dias divergente em produção.
 */
function startFakeKeycloak(input: {
  readonly loginThemeInHtml: string | undefined
  readonly storedLoginTheme: string | undefined
  readonly storedEditUsernameAllowed?: boolean
}): FakeKeycloak {
  const state: {
    loginThemeInHtml: string | undefined
    storedLoginTheme: string | undefined
    storedEditUsernameAllowed: boolean
  } = {
    loginThemeInHtml: input.loginThemeInHtml,
    storedEditUsernameAllowed: input.storedEditUsernameAllowed ?? true,
    storedLoginTheme: input.storedLoginTheme,
  }
  const writes: string[] = []
  const usernameWrites: boolean[] = []

  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const { pathname } = new URL(request.url)

      if (pathname.endsWith('/protocol/openid-connect/token')) {
        return Response.json({ access_token: ADMIN_TOKEN, expires_in: 60 })
      }
      if (pathname === `/admin/realms/${REALM}`) {
        if (request.method === 'PUT') {
          const body = (await request.json()) as {
            readonly editUsernameAllowed?: boolean
            readonly loginTheme?: string
          }
          /** Cada ajuste manda o campo dele: um PUT com o outro campo apagaria o que não foi tocado. */
          if (body.loginTheme !== undefined) {
            writes.push(body.loginTheme)
            state.storedLoginTheme = body.loginTheme
          }
          if (body.editUsernameAllowed !== undefined) {
            usernameWrites.push(body.editUsernameAllowed)
            state.storedEditUsernameAllowed = body.editUsernameAllowed
          }
          return new Response(null, { status: 204 })
        }
        return Response.json({
          editUsernameAllowed: state.storedEditUsernameAllowed,
          realm: REALM,
          ...(state.storedLoginTheme === undefined ? {} : { loginTheme: state.storedLoginTheme }),
        })
      }
      if (pathname.endsWith('/protocol/openid-connect/auth')) {
        /**
         * O `account-console` exige PKCE: sem `code_challenge` o Keycloak devolve 302 para a página
         * de erro e nenhuma tela de login é renderizada. O smoke passava por ali achando que o tema
         * estava ausente — falso negativo que reprovaria todo deploy.
         */
        if (new URL(request.url).searchParams.get('code_challenge') === null) {
          return new Response(null, {
            headers: { location: '/realms/transportada/account/?error=invalid_request' },
            status: 302,
          })
        }
        const themePath =
          state.loginThemeInHtml === undefined
            ? ''
            : `<link href="/resources/abc/login/${state.loginThemeInHtml}/css/login.css">`
        return new Response(`<html><head>${themePath}</head></html>`, {
          headers: { 'content-type': 'text/html' },
        })
      }
      return new Response('não encontrado', { status: 404 })
    },
  })

  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    get loginThemeInHtml() {
      return state.loginThemeInHtml
    },
    stop: async () => {
      await server.stop(true)
    },
    usernameWrites,
    get storedLoginTheme() {
      return state.storedLoginTheme
    },
    writes,
  }
}

type RunResult = {
  readonly exitCode: number
  readonly output: string
  readonly usernameWrites: readonly boolean[]
  readonly writes: readonly string[]
}

async function runReconcile(input: {
  readonly storedEditUsernameAllowed?: boolean
  readonly loginThemeInHtml: string | undefined
  readonly storedLoginTheme: string | undefined
}): Promise<RunResult> {
  const keycloak = startFakeKeycloak(input)
  const home = await mkdtemp(join(tmpdir(), 'keycloak-reconcile-'))
  const binaryDirectory = join(home, 'bin')
  await mkdir(binaryDirectory)
  const stubPath = join(binaryDirectory, 'railway')
  await writeFile(stubPath, buildRailwayStub(keycloak.baseUrl))
  await chmod(stubPath, 0o755)

  const spawned = Bun.spawn({
    cmd: ['bash', Bun.fileURLToPath(RECONCILE_SCRIPT)],
    cwd: home,
    env: {
      HOME: home,
      PATH: `${binaryDirectory}:${Bun.env.PATH ?? ''}`,
      TARGET_ENVIRONMENT: 'staging',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    spawned.exited,
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
  ])
  const writes = [...keycloak.writes]
  const usernameWrites = [...keycloak.usernameWrites]
  await keycloak.stop()
  await rm(home, { force: true, recursive: true })

  return { exitCode, output: `${stdout}${stderr}`, usernameWrites, writes }
}

/**
 * `--import-realm` **ignora realm já existente**: nada do `realm.json` alcança um realm criado.
 * Foi assim que `"loginTheme": "transportada"` ficou no repositório enquanto os dois ambientes
 * serviam `keycloak.v2` — arquivo aprovado em review, deploy verde, realm intacto. Este contrato
 * cobra que a configuração de realm seja aplicada de verdade e conferida no ar.
 */
describe('contrato de reconciliação do realm', () => {
  /** O que o arquivo declara passa a valer no realm, em vez de ficar sendo um desejo. */
  test('realm sem tema recebe o nosso e o deploy segue', async () => {
    const result = await runReconcile({
      loginThemeInHtml: LOGIN_THEME,
      storedLoginTheme: undefined,
    })

    expect(result.writes).toEqual([LOGIN_THEME])
    expect(result.exitCode).toBe(0)
  })

  /** Reconciliar roda em todo deploy de identidade: escrever à toa é ruído no log de auditoria. */
  test('realm já reconciliado não é escrito de novo', async () => {
    const result = await runReconcile({
      loginThemeInHtml: LOGIN_THEME,
      storedLoginTheme: LOGIN_THEME,
    })

    expect(result.writes).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  /**
   * O caso que não pode passar: o realm aponta para um tema que a imagem não tem. O Keycloak cai no
   * tema padrão sem reclamar de nada, e o login do cliente fica errado em silêncio.
   */
  test('página de login servindo outro tema reprova o deploy', async () => {
    const result = await runReconcile({
      loginThemeInHtml: 'keycloak.v2',
      storedLoginTheme: LOGIN_THEME,
    })

    expect(result.output).toContain('keycloak.v2')
    expect(result.exitCode).not.toBe(0)
  })

  /** Instalação nova nasce certa: o service account precisa poder escrever configuração de realm. */
  test('o service account administrativo pode reconciliar realm', async () => {
    const realm = (await Bun.file(REALM_PATH).json()) as {
      readonly users: readonly {
        readonly clientRoles?: { readonly 'realm-management'?: readonly string[] }
        readonly serviceAccountClientId?: string
      }[]
    }
    const account = realm.users.find((user) => user.serviceAccountClientId === 'transportada-admin')

    expect(account?.clientRoles?.['realm-management']).toContain('manage-realm')
  })

  /** Reconciliar depois de publicar: antes, o tema novo ainda não está na imagem. */
  test('o pipeline reconcilia o realm depois do deploy de identidade', async () => {
    const workflow = await Bun.file(DEPLOY_WORKFLOW_PATH).text()
    const identityStep = workflow.indexOf('railway-deploy.sh deploy keycloak')
    const reconcileStep = workflow.indexOf('keycloak-reconcile.sh')

    expect(reconcileStep).toBeGreaterThan(identityStep)
  })
})

/**
 * A troca de login no painel depende de `editUsernameAllowed`, e ele é **desligado por padrão** no
 * Keycloak. Declarar no `realm.json` não alcança realm que já existe — o mesmo buraco do tema —, e
 * sem este passo o operador só descobre ao salvar, com o erro vindo do Admin API.
 */
describe('contrato de reconciliação — troca de login', () => {
  test('realm com a troca desligada é ligado, e o deploy segue', async () => {
    const result = await runReconcile({
      loginThemeInHtml: LOGIN_THEME,
      storedEditUsernameAllowed: false,
      storedLoginTheme: LOGIN_THEME,
    })

    expect(result.usernameWrites).toEqual([true])
    expect(result.exitCode).toBe(0)
  })

  /** Escrever à toa em todo deploy é ruído no log de auditoria, aqui como no tema. */
  test('realm já ligado não é escrito de novo', async () => {
    const result = await runReconcile({
      loginThemeInHtml: LOGIN_THEME,
      storedEditUsernameAllowed: true,
      storedLoginTheme: LOGIN_THEME,
    })

    expect(result.usernameWrites).toEqual([])
  })

  /** Os dois ajustes são independentes: ligar um não pode apagar o outro no mesmo PUT. */
  test('ligar a troca de login não reescreve o tema', async () => {
    const result = await runReconcile({
      loginThemeInHtml: LOGIN_THEME,
      storedEditUsernameAllowed: false,
      storedLoginTheme: LOGIN_THEME,
    })

    expect(result.writes).toEqual([])
  })
})
