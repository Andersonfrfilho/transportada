/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const WORKFLOW_PATH = new URL('.github/workflows/bucket-mirror.yml', REPOSITORY_ROOT)

const SOURCE_PREFIX = 'FISCAL_SOURCE_S3_'
const MIRROR_PREFIX = 'FISCAL_MIRROR_S3_'

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

describe('contrato do espelho do bucket fiscal', () => {
  test('roda todo dia sozinho, e à mão quando alguém precisar', async () => {
    const workflow = await parseWorkflow()
    const schedule = workflow.on.schedule as readonly Readonly<{ cron: string }>[]

    expect(schedule).toHaveLength(1)
    expect(schedule[0]?.cron).toMatch(/^\S+ \S+ \* \* \*$/)
    expect(workflow.on).toHaveProperty('workflow_dispatch')
  })

  /**
   * XML autorizado é imutável (ADR-0006): sumir na origem é anomalia, não intenção, e um espelho
   * que replica remoção propaga o acidente em vez de proteger dele.
   */
  test('o espelho nunca apaga', async () => {
    const content = await readWorkflow()

    expect(content).not.toContain('--delete')
    expect(content).not.toContain('aws s3 rm')
    expect(content).not.toContain('delete-object')
  })

  test('só o que falta é copiado, comparando origem e espelho', async () => {
    const content = await readWorkflow()

    expect(content).toContain('comm -23')
    expect(content).toContain('aws s3 cp')
  })

  /** Uma credencial só para os dois lados torna a escrita na origem um erro de digitação. */
  test('a leitura da origem e a escrita no espelho usam credenciais separadas', async () => {
    const content = await readWorkflow()

    for (const suffix of ['ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'ENDPOINT', 'BUCKET']) {
      expect(content).toContain(`${SOURCE_PREFIX}${suffix}`)
      expect(content).toContain(`${MIRROR_PREFIX}${suffix}`)
    }
  })

  test('nenhum valor literal: chave sai de secrets, o resto de vars', async () => {
    const content = await readWorkflow()
    const assignments = [...content.matchAll(/^\s{6}(FISCAL_\w+):\s*(.+)$/gm)]

    expect(assignments.length).toBeGreaterThanOrEqual(10)
    for (const [, name = '', rawValue = ''] of assignments) {
      const source = /KEY/.test(name) ? '${{ secrets.' : '${{ vars.'
      expect(`${name}=${rawValue.trim().startsWith(source)}`).toBe(`${name}=true`)
    }
  })

  test('o job não tem permissão de escrita no repositório nem roda para sempre', async () => {
    const workflow = await parseWorkflow()
    const job = workflow.jobs.mirror

    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(job?.['timeout-minutes']).toBeGreaterThan(0)
  })
})
