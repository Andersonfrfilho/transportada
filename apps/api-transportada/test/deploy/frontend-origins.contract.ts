/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Toda app com login precisa que **três** lugares saibam da origem dela: `redirectUris` e
 * `webOrigins` no Keycloak, e `FRONTEND_ORIGIN` na api. Os dois primeiros viraram código; o terceiro
 * é variável na Railway, e foi o que ficou para trás quando o portal do contratante subiu — o login
 * passou e a primeira chamada morreu em CORS, no navegador.
 *
 * O que a máquina consegue afirmar sem falar com a Railway é que o guarda existe, que ele roda no
 * deploy e que ele reprova. Se a variável de fato cobre as origens, quem responde é o próprio
 * `frontend-origins-check.sh`, contra o ambiente.
 */
import { describe, expect, test } from 'bun:test'

const CHECK_PATH = new URL('../../../../.github/scripts/frontend-origins-check.sh', import.meta.url)
  .pathname
const WORKFLOW_PATH = new URL('../../../../.github/workflows/deploy.yml', import.meta.url).pathname

describe('origens do frontend conferidas no deploy', () => {
  test('o deploy da api confere as origens depois das migrations', async () => {
    const workflow = await Bun.file(WORKFLOW_PATH).text()

    const migrations = workflow.indexOf('assert-migrations api')
    const origins = workflow.indexOf('frontend-origins-check.sh')

    expect(origins).toBeGreaterThan(migrations)
  })

  /**
   * O guarda não pode ser quem abre a porta: `FRONTEND_ORIGIN` decide quem fala com a api, e um
   * passo de deploy que a escrevesse teria permissão de ampliar sozinho o que ele deveria vigiar.
   */
  test('o passo confere e não escreve a variável', async () => {
    const script = await Bun.file(CHECK_PATH).text()

    expect(script).toContain('railway variables')
    expect(script).not.toContain('railway variables --set')
    expect(script).not.toContain('variablesUpsert')
  })

  /**
   * `https://app.x` é prefixo de `https://app.x.y`: comparar por substring daria por presente uma
   * origem que não está na lista, e o CORS quebraria com o guarda verde.
   */
  test('a comparação é por item inteiro, não por substring', async () => {
    const script = await Bun.file(CHECK_PATH).text()

    expect(script).toContain('--line-regexp')
    expect(script).toContain('--fixed-strings')
  })

  /** Origem faltando precisa reprovar o release: avisar sem falhar é o mesmo que não avisar. */
  test('origem faltando sai com erro', async () => {
    const script = await Bun.file(CHECK_PATH).text()

    expect(script).toContain('::error::FRONTEND_ORIGIN')
    expect(script).toMatch(/não tem:\$missing[\s\S]*exit 1/u)
  })
})
