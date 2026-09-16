/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../../', import.meta.url)
const DEPLOY_WORKFLOW = readFileSync(
  new URL('.github/workflows/deploy.yml', REPOSITORY_ROOT),
  'utf8',
)

/** O job `deploy-api` até o próximo job de primeiro nível dentro de `jobs:`. */
function deployApiJob(): string {
  const start = DEPLOY_WORKFLOW.indexOf('\n  deploy-api:')
  const end = DEPLOY_WORKFLOW.indexOf('\n  deploy-frontend:', start)
  return DEPLOY_WORKFLOW.slice(start, end)
}

/**
 * 16/09/2026: o tema novo do Keycloak nunca chegou a staging. O push que mudou `deploy/keycloak/`
 * teve o gate vermelho, o seguinte foi cancelado, e o que passou comparava com o commit anterior do
 * **próprio** push — que não tinha a mudança. E o "forçar Keycloak" manual terminou verde sem
 * publicar, porque o passo mora dentro do job da API, pulado com a API inalterada.
 */
describe('o deploy do Keycloak não perde mudança nem pedido manual', () => {
  test('o baseline do tema é o marco da API, não o commit anterior do push', () => {
    const job = deployApiJob()

    expect(job).toContain("git fetch --no-tags --quiet origin '+refs/deploy/*:refs/deploy/*'")
    expect(job).toContain('marker="refs/deploy/${TARGET_ENVIRONMENT}/api"')
    expect(job.indexOf('marker=')).toBeLessThan(
      job.indexOf('baseline="${{ github.event.before }}"'),
    )
  })

  test('pedir o Keycloak à mão roda o job mesmo com a API inalterada', () => {
    expect(deployApiJob()).toContain(
      "if: needs.changes.outputs.api == 'true' || inputs.deploy_identity == true",
    )
  })

  /** Pedir o Keycloak não pode republicar a API nem rodar migration de carona. */
  test('os passos da API só rodam quando a API mudou', () => {
    const job = deployApiJob()
    for (const step of [
      'Deploy API',
      'Conferir migrations aplicadas',
      'Conferir as origens do frontend',
    ]) {
      const at = job.indexOf(`- name: ${step}`)
      expect(at).toBeGreaterThan(-1)
      expect(
        job.slice(
          at,
          job.indexOf('\n      - ', at + 1) === -1 ? undefined : job.indexOf('\n      - ', at + 1),
        ),
      ).toContain("if: needs.changes.outputs.api == 'true'")
    }
  })
})
