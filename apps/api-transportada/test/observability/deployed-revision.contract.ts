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
