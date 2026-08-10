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
   *
   * O digest vem junto porque a tag é ponteiro móvel: um teste de restauração que roda numa imagem
   * diferente a cada mês não prova que o backup restaura, prova que restaurou naquela imagem.
   */
  test('o alvo é um Postgres efêmero da versão do servidor, pinado por digest', async () => {
    const workflow = await parseWorkflow()
    const job = workflow.jobs[JOB_NAME]
    const services = job?.services as Readonly<Record<string, Readonly<{ image: string }>>>
    const content = await readWorkflow()

    expect(services?.postgres?.image).toMatch(/^postgres:18@sha256:[0-9a-f]{64}$/)
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
  test('só os dois últimos passos falam com o monitor, e cada um no seu desfecho', async () => {
    const steps = await readSteps()
    const [success, failure] = steps.slice(-2)

    expect(success?.if).toBe('success()')
    expect(failure?.if).toBe('failure()')
    for (const step of steps.slice(0, -2)) {
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
    const run = steps.at(-2)?.run ?? ''

    expect(run).toContain('RESTORE_HEARTBEAT_TOKEN')
    expect(run).toMatch(/--request POST/)
    expect(run).toMatch(/Authorization: Bearer \$\{?RESTORE_HEARTBEAT_TOKEN\}?/)
    expect(run).toContain('success=true')
  })

  /**
   * A ausência do ping não serve de alerta aqui. O Gatus avalia heartbeat num tique de intervalo
   * contado a partir do start do processo dele, não do último push: a janela de 32 dias só é olhada
   * 32 dias depois de o Gatus subir, e cada redeploy zera essa contagem. Um restore que quebrou hoje
   * viraria notificação em setembro, se virasse. Quem falha avisa que falhou; a janela fica sendo o
   * que ela sabe fazer — pegar o mês em que ninguém rodou.
   */
  test('o restore que quebra avisa o monitor na hora, com success=false', async () => {
    const run = (await readSteps()).at(-1)?.run ?? ''

    expect(run).toMatch(/--request POST/)
    expect(run).toMatch(/Authorization: Bearer \$\{?RESTORE_HEARTBEAT_TOKEN\}?/)
    expect(run).toContain('success=false')
  })

  /**
   * `curl` sem `--fail` sai com código 0 quando o edge devolve 502, e o `|| true` engole o resto: o
   * push some sem rastro no log do run e sem chegar ao monitor. Foi assim que o primeiro push
   * vermelho do drick se perdeu — o job ficou vermelho, o Gatus nunca soube, ninguém foi avisado.
   * Uma tentativa só também não basta: a recusa do edge aqui é intermitente, não permanente.
   */
  test('push recusado vira aviso no run, e não silêncio', async () => {
    const steps = await readSteps()

    for (const step of steps.slice(-2)) {
      expect(step.run ?? '').toContain('--fail')
      expect(step.run ?? '').toContain('--retry')
    }
    expect(steps.at(-1)?.run ?? '').toContain('::warning::')
  })

  /**
   * O job já está vermelho quando este passo roda. Faltando configuração ou caindo o push, insistir
   * em falhar só troca a causa que aparece no resumo do run pela última que aconteceu.
   */
  test('o aviso de falha não tem como piorar o desfecho do job', async () => {
    const run = (await readSteps()).at(-1)?.run ?? ''

    expect(run).not.toContain('exit 1')
    // O mesmo `||` que absorve o push recusado é o que impede este passo de trocar a causa do run.
    expect(run).toMatch(/\|\|\s*\n?\s*echo "::warning::/)
  })
})
