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

  /** O `gate` pende do `changes`, e é assim que ele herda a alcançabilidade. */
  test('o gate pende do `changes`, nunca do `target`', () => {
    const block = jobBlock('gate')

    expect(block).toInclude('needs: changes')
    expect(block).not.toInclude('target')
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
