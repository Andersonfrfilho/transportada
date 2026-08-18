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
   * Cada ambiente é publicado pelo push da branch dele. Publicar staging pelo PR era a intenção
   * anterior e nunca executou um passo: a política de branch do ambiente casa com `refs/heads/*`, o
   * PR roda em `refs/pull/N/merge`, e desde 08/12/2025 o GitHub avalia a regra contra o ref de
   * execução — todo deploy de PR morria em "Branch is not allowed to deploy to staging" com zero
   * passos, e o PR passava verde porque o gate tinha passado.
   *
   * O preço conhecido é o back-merge de main em staging redeployar conteúdo idêntico. É idempotente,
   * e é o que mantém staging igual à branch staging.
   */
  test('push publica os dois ambientes, um por branch', async () => {
    const block = triggerBlock(await readWorkflow(DEPLOY_WORKFLOW_PATH))

    expect(branchesOf(block, 'push')).toEqual(['main', 'staging'])
  })

  /** Trocar o mapa de branch para ambiente publica o código errado no lugar errado, e em silêncio. */
  test('main resolve produção e staging resolve staging', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toMatch(/= "main" \]; then\s+resolved=production/)
    expect(workflow).toMatch(/= "staging" \]; then\s+resolved=staging/)
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
   * Em PR o workflow existe só para produzir o gate. Deploy de PR é recusado pela política de branch
   * do ambiente e falha com zero passos — um job vermelho que não diz o que aconteceu. `base_ref`
   * era a porta que deixava o PR mirando staging chegar até lá; ela não pode voltar.
   */
  test('pull request nenhum publica: roda o gate e para aí', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain("if: github.event_name != 'pull_request'")
    expect(workflow).not.toContain('github.base_ref')
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

/**
 * O passo do Keycloak decide por diff, e por quatro dias ele decidiu errado em silêncio: o tema de
 * login existia no repositório desde `d125958` e nenhum dos dois ambientes o servia. Duas causas, e
 * as duas terminam na mesma linha de log — `Keycloak inalterado: deploy pulado`:
 *
 * 1. `fetch-depth: 2` não traz o commit de `event.before`. `git diff` contra commit ausente falha,
 *    o `2>/dev/null` engole o erro, e o `grep` não acha nada.
 * 2. Em `workflow_dispatch` o `event.before` **não existe**: o baseline vem vazio.
 *
 * O que este contrato cobra é que a ignorância não possa se disfarçar de "inalterado".
 */
describe('contrato do deploy de identidade', () => {
  /** Diff precisa do commit do outro lado: com histórico truncado ele nunca está lá. */
  test('o job de deploy clona com histórico suficiente para o diff', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).not.toContain('fetch-depth: 2')
    expect(workflow).toContain('fetch-depth: 0')
  })

  /** Baseline inutilizável é dúvida, e dúvida publica — nunca cai no ramo do "inalterado". */
  test('baseline ausente ou desconhecido publica em vez de pular', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).toContain('baseline indisponível')
    expect(workflow).toContain('git cat-file -e')
  })

  /** Erro de `git` não pode virar "nada mudou": o `2>/dev/null` era exatamente essa confusão. */
  test('o diff do tema não engole a saída de erro do git', async () => {
    const workflow = await readWorkflow(DEPLOY_WORKFLOW_PATH)

    expect(workflow).not.toContain('git diff --name-only "$baseline" HEAD 2>/dev/null')
  })
})
