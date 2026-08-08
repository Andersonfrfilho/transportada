/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const WORKFLOW_PATH = new URL('.github/workflows/restore-test.yml', REPOSITORY_ROOT)

const JOB_NAME = 'restore-test'
/** Os mesmos parâmetros do `deploy/backup/backup.sh`: decifrar com outros é não decifrar. */
const DECIPHER_ARGUMENTS = '-aes-256-cbc -pbkdf2 -iter 100000'

type Step = Readonly<{ if?: string; name?: string; run?: string }>

type Workflow = Readonly<{
  jobs: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  on: Readonly<Record<string, unknown>>
  permissions: Readonly<Record<string, string>>
}>

async function readWorkflow(): Promise<string> {
  return Bun.file(WORKFLOW_PATH).text()
}

async function parseWorkflow(): Promise<Workflow> {
  return Bun.YAML.parse(await readWorkflow()) as Workflow
}

async function readSteps(): Promise<readonly Step[]> {
  const workflow = await parseWorkflow()
  return workflow.jobs[JOB_NAME]?.steps as readonly Step[]
}

describe('contrato do teste mensal de restore', () => {
  test('roda todo mês sozinho, e à mão quando alguém precisar', async () => {
    const workflow = await parseWorkflow()
    const schedule = workflow.on.schedule as readonly Readonly<{ cron: string }>[]

    expect(schedule).toHaveLength(1)
    expect(schedule[0]?.cron).toMatch(/^\S+ \S+ \d+ \* \*$/)
    expect(workflow.on).toHaveProperty('workflow_dispatch')
  })

  /**
   * Cliente mais novo que o servidor recusa a conexão, e cliente mais velho recusa o dump: casar as
   * duas versões no mesmo contêiner é o que faz o teste medir o restore, não a versão do runner.
   */
  test('o alvo é um Postgres efêmero da versão do servidor, e o cliente é o dele', async () => {
    const workflow = await parseWorkflow()
    const job = workflow.jobs[JOB_NAME]
    const services = job?.services as Readonly<Record<string, Readonly<{ image: string }>>>
    const content = await readWorkflow()

    expect(services?.postgres?.image).toBe('postgres:18')
    expect(content).toContain('job.services.postgres.id')
    expect(job?.['timeout-minutes']).toBeGreaterThan(0)
  })

  /**
   * O contexto `job` só existe dentro de `steps`. No `env` do job os contextos são `github`,
   * `needs`, `strategy`, `matrix`, `vars`, `secrets` e `inputs` — usar `job` ali invalida o arquivo
   * inteiro, e o GitHub responde com um run sem job nenhum, que é ruído difícil de ler. Só o
   * servidor pega isso: localmente o YAML continua parseando.
   */
  test('o contexto `job` fica nos steps, nunca no `env` do job', async () => {
    const jobEnv = ((await parseWorkflow()).jobs[JOB_NAME]?.env ?? {}) as Readonly<
      Record<string, string>
    >

    for (const [name, value] of Object.entries(jobEnv)) {
      expect(`${name}=${value}`).not.toContain('job.')
    }
  })

  /**
   * Um ciclo que morreu entre o upload da aplicação e o do Keycloak deixa `.enc` órfão no bucket e
   * nenhuma linha no manifesto. Escolher pelo objeto mais novo restauraria justamente esse.
   */
  test('o backup vem da última linha do manifesto, não do objeto mais novo do bucket', async () => {
    const content = await readWorkflow()

    expect(content).toContain('manifest.jsonl')
    expect(content).toContain('tail -n 1')
    expect(content).not.toContain('aws s3 ls')
  })

  /**
   * O bucket guarda os dois ambientes. Sem o ambiente no caminho o job lê o manifesto errado, e
   * ler o de staging para dizer que production restaura é pior do que não testar. Vazio colapsa
   * o caminho para `db-backups//manifest.jsonl`, que existe em ambiente nenhum: falha fechada.
   */
  test('o manifesto lido é o do ambiente declarado, e sem ele o job para', async () => {
    const content = await readWorkflow()
    const guard = (await readSteps())[0]?.run ?? ''

    expect(content).toContain('BACKUP_ENVIRONMENT: ${{ vars.BACKUP_ENVIRONMENT }}')
    expect(content).toContain('db-backups/${BACKUP_ENVIRONMENT}/manifest.jsonl')
    expect(guard).toContain('BACKUP_ENVIRONMENT')
  })

  test('o ciclo restaurado é o dos dois bancos, não só o da aplicação', async () => {
    const content = await readWorkflow()

    expect(content).toContain('pg_restore')
    expect(content).toMatch(/-eq 2\b/)
  })

  /** A guarda vem antes de tudo: um alvo errado descoberto depois do `pg_restore` é tarde. */
  test('recusa qualquer alvo que não seja o contêiner efêmero', async () => {
    const steps = await readSteps()
    const guard = steps[0]?.run ?? ''

    expect(guard).toContain('localhost')
    expect(guard).toContain('exit 1')
  })

  test('decifra com os mesmos parâmetros com que o backup cifrou', async () => {
    const content = await readWorkflow()

    expect(content).toContain(`openssl enc -d ${DECIPHER_ARGUMENTS}`)
    expect(content).toContain('-pass env:BACKUP_ENCRYPTION_KEY')
    expect(content).toContain('sha256sum -c')
  })

  /** Restaurar sem conferir prova que o arquivo abre, não que ele é o banco. */
  test('compara o restaurado com o manifesto nos três campos', async () => {
    const content = await readWorkflow()

    for (const field of ['sha256', 'tableCount', 'lastMigration']) {
      expect(content).toContain(field)
    }
  })

  test('nenhuma credencial de escrita em production entra no job', async () => {
    const workflow = await parseWorkflow()
    const content = await readWorkflow()

    expect(workflow.permissions).toEqual({ contents: 'read' })
    for (const forbidden of ['RAILWAY_TOKEN', 'APP_DATABASE_URL', 'KEYCLOAK_DATABASE_URL']) {
      expect(content).not.toContain(forbidden)
    }
  })

  test('a chave, a credencial do bucket e o heartbeat saem de secrets', async () => {
    const content = await readWorkflow()

    for (const name of [
      'BACKUP_ENCRYPTION_KEY',
      'BACKUP_S3_ACCESS_KEY_ID',
      'BACKUP_S3_SECRET_ACCESS_KEY',
      'RESTORE_HEARTBEAT_URL',
      'RESTORE_HEARTBEAT_TOKEN',
    ]) {
      expect(`${name}=${content}`).toContain(`${name}: \${{ secrets.${name} }}`)
    }
  })

  /** Heartbeat que pinga mesmo com o passo anterior vermelho é o alerta que nunca dispara. */
  test('o heartbeat é o último passo e só pinga no sucesso', async () => {
    const steps = await readSteps()
    const last = steps.at(-1)

    expect(last?.run).toContain('RESTORE_HEARTBEAT_URL')
    expect(last?.if).toBe('success()')
    for (const step of steps.slice(0, -1)) {
      expect(step.run ?? '').not.toContain('RESTORE_HEARTBEAT_URL')
    }
  })

  /**
   * `GET` na URL do Gatus é 404, e 404 com `--fail` é o job vermelho depois de o restore ter dado
   * certo — indistinguível de um restore que quebrou. Aqui, ao contrário do backup, a ausência de
   * URL ou de token é falha declarada: restore que não avisa ninguém não vale como teste.
   */
  test('o push do restore é POST autenticado e falha fechado sem URL ou token', async () => {
    const steps = await readSteps()
    const run = steps.at(-1)?.run ?? ''

    expect(run).toContain('RESTORE_HEARTBEAT_TOKEN')
    expect(run).toMatch(/--request POST/)
    expect(run).toMatch(/Authorization: Bearer \$\{?RESTORE_HEARTBEAT_TOKEN\}?/)
    expect(run).toContain('success=true')
  })
})
