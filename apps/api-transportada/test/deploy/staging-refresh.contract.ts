/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const REFRESH_DIRECTORY = new URL('deploy/staging-refresh/', REPOSITORY_ROOT)
const SCRIPT_PATH = new URL('staging-refresh.sh', REFRESH_DIRECTORY)
const REBIND_SQL_PATH = new URL('rebind-identities.sql', REFRESH_DIRECTORY)
const DOCKERFILE_PATH = new URL('Dockerfile', REFRESH_DIRECTORY)
const RAILWAY_CODE_PATH = new URL('.railway/railway.ts', REPOSITORY_ROOT)

const KEYCLOAK_VARIABLES = [
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_ADMIN_CLIENT_ID',
  'KEYCLOAK_ADMIN_CLIENT_SECRET',
]

async function readScript(): Promise<string> {
  return Bun.file(SCRIPT_PATH).text()
}

function positionOf(content: string, needle: string): number {
  const index = content.indexOf(needle)
  if (index < 0) {
    throw new Error(`Trecho ausente: ${needle}`)
  }
  return index
}

function functionBody(script: string, name: string): string {
  const start = positionOf(script, `${name}() {`)
  return script.slice(start, script.indexOf('\n}\n', start))
}

describe('contrato do serviço staging-refresh', () => {
  /**
   * O ciclo de 13/09/2026 morreu com "errors ignored on restore: 78": só `public` caía, e os
   * schemas dos pacotes (`user`, `notification`, `meta_whatsapp`) e o journal do `drizzle`
   * sobreviviam para colidir com o dump. A lista vem do dump, não de uma lista escrita à mão —
   * pacote novo com schema próprio entraria no próximo ciclo sem ninguém lembrar de atualizá-la.
   */
  test('derruba todo schema que o dump traz, descoberto pelo próprio dump', async () => {
    const restore = functionBody(await readScript(), 'restore_over_staging')

    expect(restore).toContain('list_dump_schemas')
    expect(restore).not.toContain('drop schema if exists public cascade')
    expect(restore).toContain("format('drop schema if exists %I cascade'")
    expect(restore).toContain('\\gexec')
    expect(functionBody(await readScript(), 'list_dump_schemas')).toContain('pg_restore --list')
  })

  test('o que é do Postgres nunca entra na lista de schemas derrubados', async () => {
    const restore = functionBody(await readScript(), 'restore_over_staging')

    expect(restore).toContain("name !~ '^pg_'")
    expect(restore).toContain("name <> 'information_schema'")
  })

  test('o drop acontece numa transação, antes do pg_restore, e o public volta a existir', async () => {
    const restore = functionBody(await readScript(), 'restore_over_staging')

    expect(positionOf(restore, 'begin;')).toBeLessThan(positionOf(restore, 'drop schema'))
    expect(positionOf(restore, 'commit;')).toBeLessThan(positionOf(restore, 'pg_restore --dbname'))
    expect(restore).toContain('create schema public')
  })

  /**
   * O pg_dump não lista o `public` — todo banco nasce com ele. Se a condição de recriá-lo olhar a
   * lista do drop (que acrescenta o `public`), ele nunca volta, e o pg_restore falha em cada objeto
   * dele: foi o que o primeiro ensaio contra Postgres 18 mostrou, com 1306 erros.
   */
  test('a recriação do public olha a lista do dump, não a do drop', async () => {
    const script = await readScript()
    const restore = functionBody(script, 'restore_over_staging')

    expect(functionBody(script, 'list_dump_schemas')).not.toContain('echo public')
    expect(restore).toMatch(
      /create schema public' where not \('public' = any\(string_to_array\(:'dump_schemas'/,
    )
  })

  /**
   * O Keycloak de staging não é restaurado, mas `external_identities` vem de produção com o issuer e
   * os subjects de lá: sem religar, todo login de staging responde 401. O religamento vem antes do
   * redeploy, porque é o redeploy que devolve o tráfego à API.
   */
  test('religa as identidades depois do restore e antes do redeploy', async () => {
    const script = await readScript()
    const main = functionBody(script, 'main')

    expect(positionOf(main, 'restore_over_staging')).toBeLessThan(
      positionOf(main, 'rebind_staging_identities'),
    )
    expect(positionOf(main, 'rebind_staging_identities')).toBeLessThan(
      positionOf(main, 'redeploy_staging_api'),
    )
    expect(main).toContain('CURRENT_STEP=rebind_identities')
  })

  test('as variáveis do Keycloak de staging são obrigatórias no boot', async () => {
    const script = await readScript()
    const required = script.slice(
      positionOf(script, 'REQUIRED_VARIABLES=('),
      positionOf(script, 'CURRENT_STEP=boot'),
    )

    for (const name of KEYCLOAK_VARIABLES) {
      expect(required).toContain(name)
    }
  })

  /** Segredo em argv aparece em qualquer `ps` do contêiner: o mesmo desenho do `s3_curl`. */
  test('o client secret e o token entram no curl por stdin, nunca por argv', async () => {
    const script = await readScript()
    const token = functionBody(script, 'keycloak_admin_token')
    const get = functionBody(script, 'keycloak_admin_get')

    expect(token).toContain('grant_type=client_credentials')
    expect(token).toContain('client_secret@-')
    expect(token).not.toMatch(/client_secret=\$/)
    expect(get).toContain('--config -')
    expect(get).toContain('Authorization: Bearer')
    expect(get).toContain('/admin/realms/')
  })

  test('lê o realm inteiro, página por página', async () => {
    const fetchUsers = functionBody(await readScript(), 'fetch_realm_users')

    expect(fetchUsers).toContain('first=')
    expect(fetchUsers).toContain('max=')
    expect(fetchUsers).toContain('@tsv')
  })

  /**
   * O realm de staging pode não ter o papel `transportada-service` — o refresh de 14/09/2026 morreu
   * no 404 dele depois de restaurar produção, e parou antes de tirar a emissão e o certificado.
   * Papel ausente é "nenhuma conta de serviço", não motivo para abandonar o ciclo no meio.
   */
  test('segue sem contas de serviço quando o papel não existe no realm', async () => {
    const fetchUsers = functionBody(await readScript(), 'fetch_realm_users')

    expect(fetchUsers).toMatch(
      /if service_accounts="\$\(keycloak_admin_get [^\n]*roles\/transportada-service/,
    )
    expect(fetchUsers).toContain('staging_refresh_service_role_missing')
  })

  /**
   * Um refresh cujo `KEYCLOAK_ISSUER` aponta para o de produção religaria os usuários do realm de
   * staging no issuer de produção — e o restore recém-feito já traz esse issuer. Achar o issuer
   * alvo nos dados restaurados é o sinal de configuração trocada, e a regra é parar.
   */
  test('recusa religar num issuer que já está nos dados restaurados', async () => {
    const rebind = functionBody(await readScript(), 'rebind_staging_identities')

    expect(rebind).toContain('staging_refresh_issuer_already_bound')
    expect(rebind).toContain('exit 1')
    expect(positionOf(rebind, 'staging_refresh_issuer_already_bound')).toBeLessThan(
      positionOf(rebind, '--file "$REBIND_SQL_PATH"'),
    )
    expect(positionOf(rebind, 'staging_refresh_issuer_already_bound')).toBeLessThan(
      positionOf(rebind, 'keycloak_admin_token'),
    )
  })

  test('o SQL casa por username e por e-mail, só quando cai em um usuário, e grava no issuer de staging', async () => {
    const sql = await Bun.file(REBIND_SQL_PATH).text()

    expect(sql).toContain('identity_user_profiles')
    expect(sql).toMatch(/lower\(btrim\(p\.username\)\)/)
    expect(sql).toMatch(/lower\(btrim\(p\.email\)\)/)
    expect(sql).toContain('count(distinct user_id)')
    expect(sql).toContain("like 'service-account-%'")
    expect(sql).toContain(":'issuer'")
    expect(sql).toContain('on conflict (issuer, subject) do update')
    expect(sql).toContain('\\copy realm_users from pstdin')
    expect(positionOf(sql, 'begin;')).toBeLessThan(
      positionOf(sql, 'insert into external_identities'),
    )
    expect(sql).toContain('commit;')
  })

  /**
   * A conta de serviço do worker não tem perfil nem e-mail, e o vínculo dela vinha de produção como os
   * outros: sem religar, o worker de staging leva 401 da API. Quem diz que um usuário do realm é o
   * serviço é o papel `transportada-service` (o mesmo que a API exige), e quem diz qual pessoa do
   * sistema ele é, a membership com papel `automation` — nunca o nome do cliente.
   */
  test('religa a conta de serviço pela role do realm e pela membership automation', async () => {
    const fetchUsers = functionBody(await readScript(), 'fetch_realm_users')
    const sql = await Bun.file(REBIND_SQL_PATH).text()

    expect(fetchUsers).toContain('roles/transportada-service/users')
    expect(sql).toContain("role = 'automation'")
    expect(sql).toContain('is_service')
    expect(functionBody(await readScript(), 'rebind_staging_identities')).toContain(
      'linkedServiceAccounts',
    )
  })

  /** E-mail, username e subject são dado pessoal ou chave de conta: o log leva só as contagens. */
  test('o log do religamento tem só contagens, sem PII nem segredo', async () => {
    const script = await readScript()
    const logLines = script.split('\n').filter((line) => /^\s*log\s/.test(line))

    for (const line of logLines) {
      expect(line).not.toMatch(
        /\$\{?(users|page|token|email|username|subject)\b|SECRET|DATABASE_URL/i,
      )
    }
    expect(functionBody(script, 'rebind_staging_identities')).toContain(
      'staging_refresh_identities_rebound',
    )
    expect(script).not.toContain('set -x')
  })

  test('a imagem traz o jq e o SQL do religamento', async () => {
    const dockerfile = await Bun.file(DOCKERFILE_PATH).text()

    expect(dockerfile).toMatch(/apk add[^\n]*\bjq\b/)
    expect(dockerfile).toContain('deploy/staging-refresh/rebind-identities.sql')
  })

  /** O `railway.ts` é quem declara o que o serviço lê do ambiente; segredo vira `preserve()`. */
  test('o código do Railway declara as variáveis do Keycloak no serviço', async () => {
    const railway = await Bun.file(RAILWAY_CODE_PATH).text()
    const service = railway.slice(
      positionOf(railway, "service('staging-refresh'"),
      positionOf(railway, "service('aggregate-document-ocr'"),
    )

    for (const name of KEYCLOAK_VARIABLES) {
      expect(service).toContain(`${name}: preserve()`)
    }
  })
})
