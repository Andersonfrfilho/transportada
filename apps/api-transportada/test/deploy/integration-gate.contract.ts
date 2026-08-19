/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const CI_WORKFLOW_PATH = new URL('.github/workflows/ci.yml', REPOSITORY_ROOT)

/**
 * O bloco de um job vai até o próximo job de mesma indentação — ou até o fim do arquivo. Comentário
 * sai fora: o que este contrato lê são os passos, e um comentário que *explica* `--with-deps` não
 * pode ser confundido com o passo que o *executa*.
 */
function jobBlock(workflow: string, job: string): string {
  const lines = workflow.split('\n')
  const start = lines.indexOf(`  ${job}:`)
  if (start === -1) {
    throw new Error(`ci.yml não tem o job "${job}"`)
  }
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^ {2}\S/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).filter((line) => !/^\s*#/.test(line)).join('\n')
}

async function readWorkflow(): Promise<string> {
  return Bun.file(CI_WORKFLOW_PATH).text()
}

/**
 * O gate de integração morreu duas vezes seguidas em 19/08/2026 sem um teste sequer ter rodado, e
 * as duas no mesmo passo: `playwright install --with-deps` vira root e chama `apt-get update`, o
 * espelho `azure.archive.ubuntu.com` não respondeu (`Ign:` repetido), o apt caiu no
 * `archive.ubuntu.com` e ficou **19 minutos** parado depois do último `Get:` — até o teto de 20 do
 * job. `migration-test`, `make up`, as integrações e o smoke ficaram todos `skipped`.
 *
 * O que este contrato cobra é que a instalação do navegador não possa mais consumir o job inteiro:
 * o binário vem do cache, o apt roda num passo com teto próprio, e o teto do job é maior que o do
 * passo — senão o passo nunca chega a falhar sozinho.
 */
describe('contrato do gate de integração', () => {
  /**
   * `--with-deps` junta duas coisas de risco muito diferente num passo só: baixar o Chromium (rede
   * do CDN do Playwright, rápida e cacheável) e instalar biblioteca de sistema (apt, espelho de
   * distribuição, o que pendurou). Separadas, só a segunda precisa de teto.
   */
  test('a instalação do navegador não arrasta o apt junto', async () => {
    const block = jobBlock(await readWorkflow(), 'integration')

    expect(block).not.toContain('--with-deps')
    expect(block).toContain('playwright install chromium')
  })

  /** Passo sem teto próprio herda o do job: quando ele pendura, leva o gate inteiro. */
  test('o passo que fala com o apt tem teto de tempo próprio', async () => {
    const block = jobBlock(await readWorkflow(), 'integration')
    const step = /playwright install-deps chromium/.exec(block)

    expect(step).not.toBeNull()
    expect(
      /timeout-minutes: (\d+)\s+run: bun run --cwd [^\n]*playwright install-deps/.test(block),
    ).toBe(true)
  })

  /**
   * O binário do Chromium é o mesmo enquanto o lockfile não muda. Sem cache, todo run paga o
   * download; com cache, o passo que sobrou é o do apt — o único que ainda depende de espelho.
   */
  test('o Chromium vem do cache, chaveado pelo lockfile', async () => {
    const block = jobBlock(await readWorkflow(), 'integration')

    expect(block).toContain('actions/cache@v4')
    expect(block).toContain('~/.cache/ms-playwright')
    expect(block).toContain("hashFiles('bun.lock')")
  })

  /**
   * Teto de passo só serve se sobrar job depois dele: com os dois em 20, o passo pendurado ainda
   * termina o job junto. A folga é o que transforma "gate cancelado" em "passo vermelho, com nome".
   */
  test('o job tem folga sobre o teto do passo que pode pendurar', async () => {
    const block = jobBlock(await readWorkflow(), 'integration')
    const jobTimeout = /timeout-minutes: (\d+)/.exec(block)
    const stepTimeout =
      /timeout-minutes: (\d+)\s+run: bun run --cwd [^\n]*playwright install-deps/.exec(block)

    expect(Number(jobTimeout?.[1])).toBeGreaterThan(Number(stepTimeout?.[1]) + 10)
  })
})
