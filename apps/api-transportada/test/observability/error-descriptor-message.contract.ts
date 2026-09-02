/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { describeErrorForLog } from '../../src/logging/error-descriptor.service'
import { DiagnosableError } from '../../src/shared/diagnosable.error'

class WriteFailed extends DiagnosableError {
  public constructor() {
    super('suggestion vanished after insert')
    this.name = 'WriteFailed'
  }
}

/**
 * Spec 074: o descritor omitia **toda** mensagem, e a omissao e deliberada -- mensagem de erro
 * arbitrario pode carregar segredo (senha de PFX) ou o `detail` do driver com a linha que falhou.
 * `test/digital-certificates-http/idempotency-and-errors.contract.ts` monta um erro com essas
 * palavras e exige que nenhuma alcance o log.
 *
 * O que faltava e mais estreito: a mensagem que **nos** escrevemos e do codigo, nao do dado, e e ela
 * que torna um defeito diagnosticavel. Por isso a permissao e **nominal** -- so `DiagnosableError`.
 */
describe('error descriptor message (spec 074 RF4/RNF2)', () => {
  it('carries the message of an error marked as diagnosable', () => {
    expect(describeErrorForLog(new WriteFailed())).toMatchObject({
      errorName: 'WriteFailed',
      message: 'suggestion vanished after insert',
    })
  })

  /**
   * A metade que sustenta a politica: `Error` comum continua calado. Herdar de `DiagnosableError` e
   * uma afirmacao de quem escreve -- "esta mensagem e minha e nao interpola dado" --, e nao um
   * detalhe de tipo.
   */
  it('never carries the message of a plain error', () => {
    const descriptor = describeErrorForLog(new Error('pfx password envelope keyId cnpj'))

    expect(descriptor.message).toBeUndefined()
    expect(JSON.stringify(descriptor)).not.toInclude('password')
  })

  /** O caso que a omissao original protegia, e que segue protegido: o driver traz a linha inteira. */
  it('never carries the message of a postgres error', () => {
    const postgres = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: 'ERR_POSTGRES_SERVER_ERROR',
      constraint: 'fleet_vehicles_owner_check',
      detail: 'Failing row contains (uuid, 00955667283, JOAO DA SILVA, Rua Real 100).',
      errno: '23505',
      name: 'PostgresError',
    })

    const descriptor = describeErrorForLog(postgres)

    expect(descriptor.message).toBeUndefined()
    expect(JSON.stringify(descriptor)).not.toInclude('Failing row')
    expect(JSON.stringify(descriptor)).not.toInclude('JOAO DA SILVA')
  })

  /**
   * ⚠️ Nem um `DiagnosableError` escapa da regra do driver: se ele **envolver** um erro do Postgres,
   * o descritor volta a calar a mensagem, porque `findPostgresError` alcanca a causa aninhada.
   */
  it('stays silent when a diagnosable error wraps a postgres error', () => {
    const wrapper = Object.assign(new WriteFailed(), {
      cause: Object.assign(new Error('violates unique constraint'), {
        constraint: 'route_suggestions_status_check',
        errno: '23505',
        name: 'PostgresError',
      }),
    })

    expect(describeErrorForLog(wrapper).message).toBeUndefined()
  })

  it('survives an error that is not an Error at all', () => {
    expect(describeErrorForLog('boom')).toMatchObject({ errorName: 'UnknownError' })
    expect(describeErrorForLog(null).message).toBeUndefined()
  })
})
