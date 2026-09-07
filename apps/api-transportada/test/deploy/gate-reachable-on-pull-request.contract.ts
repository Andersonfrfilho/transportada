/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O gate precisa ser **alcançável em PR**, e isso não é detalhe de encanamento: a proteção de `main`
 * exige `gate / quality` e `gate / integration` como checks obrigatórios. Enquanto `changes`
 * dependia de um `target` que pula em todo PR, os dois pulavam junto — a regra pedia um sinal que o
 * workflow nunca emitiria ali, e **nenhum PR de promoção podia ser mergeado**.
 *
 * O sintoma não aponta para a causa: o PR aparece `MERGEABLE` e `BLOCKED` ao mesmo tempo, com todos
 * os jobs `SKIPPED` e nenhuma falha para ler.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  new URL('../../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
)

/**
 * ⚠️ **As diretivas do job, sem comentário — e isto não é preciosismo.** A primeira versão deste
 * teste casava o texto do bloco inteiro, e o comentário que *explica* a condição satisfazia a
 * asserção sobre a condição: apagar o `if:` do gate deixava o teste verde, porque as palavras
 * continuavam ali, num comentário. Um teste que o próprio comentário satisfaz não guarda nada.
 *
 * `jobBlock` também alcança os comentários do job seguinte, que moram antes do nome dele.
 */
function jobDirectives(name: string): readonly string[] {
  return jobBlock(name)
    .split('\n')
    .filter((line) => line.startsWith('    ') && !line.trimStart().startsWith('#'))
}

function jobBlock(name: string): string {
  const from = workflow.indexOf(`\n  ${name}:\n`)
  const rest = workflow.slice(from + 1)
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n/u)

  return next === -1 ? rest : rest.slice(0, next + 1)
}

describe('o gate é alcançável em pull request', () => {
  /** É a linha que criou o impasse, e ela não pode voltar sem que este teste caia. */
  test('`changes` roda em PR mesmo com o `target` pulado', () => {
    const block = jobBlock('changes')

    expect(block).toInclude("github.event_name == 'pull_request'")
    expect(block).toInclude('always()')
  })

  /**
   * ⚠️ **Este teste afirmava a premissa errada, e por isso ficou verde enquanto o gate pulava.**
   * Ele dizia que o gate "herda a alcançabilidade" do `changes` — e no GitHub Actions isso não
   * existe: `always()` resgata o job onde está escrito, nunca quem depende dele. Job sem `if:`
   * cujo ancestral **transitivo** foi pulado é pulado junto. Medido no run 34064539851, que rodou
   * com o `changes` já corrigido e pulou o gate assim mesmo.
   *
   * Agora o que se afirma é a condição que decide, não a forma do bloco.
   */
  test('o gate tem condição própria, e ela não depende do `target`', () => {
    const directives = jobDirectives('gate')

    expect(directives.filter((line) => line.trimStart().startsWith('needs:'))).toEqual([
      '    needs: changes',
    ])
    expect(directives).toContain("    if: always() && needs.changes.result == 'success'")
  })

  /**
   * ⚠️ A outra metade, e a que importa mais: **PR não publica**. Todo job de deploy continua preso
   * ao `target`, que pula em PR. Soltar o gate sem manter isto faria um PR aberto publicar em
   * produção.
   */
  test('nenhum deploy escapa do `target`', () => {
    for (const job of [
      'deploy-api',
      'deploy-frontend',
      'deploy-landing',
      'deploy-client',
      'deploy-services',
    ]) {
      expect(jobBlock(job), `${job} publicaria a partir de um PR`).toInclude('needs: [target')
    }
  })
})
