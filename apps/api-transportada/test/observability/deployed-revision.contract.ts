/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service'

/**
 * Spec 078 P3: o descompasso de 2026-09-02 foi **mudo**. A tela dizia "Não foi possível carregar as
 * viagens", a API respondia `200`, o log ficou limpo, e diagnosticar exigiu baixar o bundle servido
 * e procurar uma string dentro dele.
 *
 * A atomicidade torna o descompasso raro; ela não o torna **visível** — e rollback continua
 * produzindo um. Sem isto, o próximo custa a mesma investigação.
 */
describe('a revisão publicada é observável (spec 078 T007)', () => {
  function build(revision: string | undefined) {
    return new HealthService({
      database: {
        close: async () => undefined,
        healthCheck: async () => ({ healthy: true as const }),
      },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: { countPending: async () => 0 },
      ...(revision === undefined ? {} : { revision }),
    })
  }

  test('a saúde carrega a revisão que subiu', async () => {
    const health = await build('abc1234').live()

    expect(health.revision).toBe('abc1234')
  })

  /**
   * ⚠️ Ambiente sem a variável responde `unknown`, **nunca** omite o campo: campo ausente obrigaria
   * quem consulta a distinguir "não sei" de "esta versão é antiga e não tinha o campo" — que é
   * exatamente a ambiguidade que esta task existe para eliminar.
   */
  test('sem a variável, diz que não sabe — e não some', async () => {
    const health = await build(undefined).live()

    expect(health.revision).toBe('unknown')
  })

  /** Nada de dado de request junto: é a revisão do build, não de quem chamou (RNF1). */
  test('não carrega nada além da revisão', async () => {
    const health = await build('abc1234').live()

    expect(Object.keys(health).sort()).toEqual(['revision', 'service', 'status', 'timestamp'])
  })
})

/**
 * ⚠️ O deploy é por **imagem**, então a Railway não popula variável de git sozinha — medido em
 * staging: `RAILWAY_GIT_COMMIT_SHA` não existe no serviço, e a saúde respondia `unknown`. Quem sabe
 * o SHA é o Action, e é ele que grava.
 */
describe('a revisão chega ao serviço pelo deploy (spec 078 T008)', () => {
  test('o script de deploy grava a revisão que o Action conhece', async () => {
    const script = await Bun.file(
      new URL('../../../../.github/scripts/railway-deploy.sh', import.meta.url),
    ).text()

    expect(script).toInclude('DEPLOYED_REVISION=${GITHUB_SHA:0:7}')
    /** Gravar variável não pode disparar um segundo deploy em cima do que está subindo. */
    expect(script).toInclude('--skip-deploys')
  })

  /** E falhar ao gravar não derruba o deploy: `unknown` é legível, deploy interrompido não é. */
  test('a gravação da revisão não derruba o deploy', async () => {
    const script = await Bun.file(
      new URL('../../../../.github/scripts/railway-deploy.sh', import.meta.url),
    ).text()
    const bloco = script.slice(script.indexOf('DEPLOYED_REVISION'))

    expect(bloco.slice(0, bloco.indexOf('railway up'))).toInclude('||')
  })
})
