/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRunJobUseCase } from '../../src/operations/application/run-job.use-case.js'
import type { StartedManualExecution } from '../../src/operations/application/run-job.port.js'

const CONTEXT = { companyId: crypto.randomUUID(), userId: crypto.randomUUID() }
const JOB = 'geocoding.backfill'

function build(overrides: {
  readonly published?: string[]
  readonly publishFails?: boolean
  readonly released?: string[]
  readonly started?: StartedManualExecution | null
  readonly startedWith?: unknown[]
}) {
  return createRunJobUseCase({
    executions: {
      release: (input) => {
        overrides.released?.push(input.executionId)

        return Promise.resolve()
      },
      startManual: (input) => {
        overrides.startedWith?.push(input)

        return Promise.resolve(
          overrides.started === undefined ? { executionId: 'execution-1' } : overrides.started,
        )
      },
    },
    publisher: {
      publish: (envelope) => {
        if (overrides.publishFails === true) return Promise.reject(new Error('broker down'))
        overrides.published?.push(envelope.payload.executionId)

        return Promise.resolve()
      },
    },
  })
}

describe('rodar rotina agora (spec 072)', () => {
  test('cria a execução manual e publica uma mensagem', async () => {
    const published: string[] = []
    const startedWith: unknown[] = []

    const result = await build({ published, startedWith }).run({
      context: CONTEXT,
      correlationId: 'correlation-1',
      job: JOB,
    })

    expect(result).toEqual({ executionId: 'execution-1', outcome: 'started' })
    expect(published).toEqual(['execution-1'])
  })

  /**
   * RF4: a execução carrega **quem apertou**, e o CHECK do banco exige os dois juntos quando a
   * origem é manual. Vindo do corpo, seria o cliente escolhendo em nome de quem o trabalho corre.
   */
  test('grava o requester e a empresa do contexto autenticado', async () => {
    const startedWith: unknown[] = []

    await build({ startedWith }).run({ context: CONTEXT, correlationId: 'c', job: JOB })

    expect(startedWith[0]).toMatchObject({
      companyId: CONTEXT.companyId,
      job: JOB,
      requestedBy: CONTEXT.userId,
    })
  })

  /**
   * RF3 e RNF1: o freio é o índice único, não um `select` seguido de `if` — entre os dois cabe
   * outra escrita. E ele **não é opcional**: `geocoding.backfill` fala com a BrasilAPI, e um botão
   * sem freio é um jeito de martelar serviço alheio por clique.
   */
  test('recusa quando já há execução aberta, sem publicar nada', async () => {
    const published: string[] = []

    const result = await build({ published, started: null }).run({
      context: CONTEXT,
      correlationId: 'c',
      job: JOB,
    })

    expect(result).toEqual({ outcome: 'already_running' })
    expect(published).toEqual([])
  })

  /**
   * ⚠️ RNF2 e CA3: execução gravada sem mensagem publicada fica **aberta até o abandono**, e
   * enquanto isso o índice único recusa toda tentativa seguinte — o botão quebraria e ninguém saberia
   * por quê. Falhar a publicação tem de devolver a linha.
   */
  test('devolve a execução quando a publicação falha', async () => {
    const released: string[] = []

    expect(
      build({ publishFails: true, released }).run({
        context: CONTEXT,
        correlationId: 'c',
        job: JOB,
      }),
    ).rejects.toThrow('broker down')

    await Bun.sleep(0)
    expect(released).toEqual(['execution-1'])
  })

  test('recusa rotina que não está no catálogo', async () => {
    expect(
      build({}).run({ context: CONTEXT, correlationId: 'c', job: 'nao.existe' as never }),
    ).rejects.toThrow('unknown scheduled job')
  })
})
