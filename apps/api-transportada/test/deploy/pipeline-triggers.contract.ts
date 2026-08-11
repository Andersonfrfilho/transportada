/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const DEPLOY_WORKFLOW_PATH = new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT)
const CI_WORKFLOW_PATH = new URL('.github/workflows/ci.yml', REPOSITORY_ROOT)

/** O bloco `on:` vai até a próxima chave de primeiro nível — o resto do arquivo não é gatilho. */
function triggerBlock(workflow: string): string {
  const matched = /^on:$([\s\S]*?)(?=^\S)/m.exec(workflow)
  if (matched === null) {
    throw new Error('workflow sem bloco `on:` em bloco')
  }
  return matched[1] ?? ''
}

/** `branches: [main, staging]` → ['main', 'staging'], para a chave pedida dentro do bloco. */
function branchesOf(block: string, trigger: string): readonly string[] {
  const matched = new RegExp(`^  ${trigger}:$\\s+branches: \\[([^\\]]+)\\]`, 'm').exec(block)
  if (matched === null) {
    return []
  }
  return (matched[1] ?? '').split(',').map((branch) => branch.trim())
}

async function readWorkflow(path: URL): Promise<string> {
  return Bun.file(path).text()
}

describe('contrato de gatilho do pipeline', () => {
  /**
   * Depois do squash-merge para main, o back-merge de main em staging não traz conteúdo novo —
   * staging já tinha tudo. Com `staging` no gatilho de push, esse merge vazio rodava o gate inteiro
   * e redeployava os cinco serviços: nove minutos de runner para não mudar um arquivo.
   */
  test('push só deploya main', async () => {
    const block = triggerBlock(await readWorkflow(DEPLOY_WORKFLOW_PATH))

    expect(branchesOf(block, 'push')).toEqual(['main'])
  })

  /**
   * O deploy de staging é a validação do PR: acontece antes do merge, sobre o código proposto. O PR
   * mirando main entra pelo mesmo gatilho porque a proteção da main exige os contextos `gate /
   * quality` e `gate / integration` — que só existem se este workflow rodar no commit do PR.
   */
  test('pull request mirando staging e main roda o workflow', async () => {
    const block = triggerBlock(await readWorkflow(DEPLOY_WORKFLOW_PATH))

    expect(branchesOf(block, 'pull_request')).toEqual(['main', 'staging'])
  })

  /**
   * No PR de release o workflow existe só para produzir o gate. Publicar ali republicaria em staging
   * um código que já está em staging, e é a única coisa que separa "rodar o gate" de "deployar".
   */
  test('pull request mirando main roda o gate mas não publica', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain("github.base_ref == 'staging'")
  })

  /**
   * O `deploy.yml` já chama o `ci.yml` como gate do PR. Um gatilho `pull_request` próprio no
   * `ci.yml` rodaria a mesma suíte duas vezes no mesmo commit — quality e integration, com
   * Playwright, migration-test e docker compose.
   */
  test('o CI só roda como gate chamado pelo deploy', async () => {
    const block = triggerBlock(await readWorkflow(CI_WORKFLOW_PATH))

    expect(block).toContain('workflow_call:')
    expect(block).not.toContain('pull_request')
  })

  /**
   * Sem o gatilho próprio, o `ci.yml` só existe pela chamada do deploy: se o `gate` sumir daqui,
   * nada mais roda a suíte antes de publicar.
   */
  test('o deploy chama o CI como gate e só publica depois dele', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain('uses: ./.github/workflows/ci.yml')
    expect(workflow).toMatch(/needs: \[[^\]]*\bgate\b[^\]]*\]/)
  })
})
