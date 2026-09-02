/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

/**
 * ⚠️ **Conexão de RabbitMQ que ninguém fecha mantém o processo vivo depois do SIGTERM.**
 *
 * O dreno nunca termina, o orquestrador mata à força, e o teste de desligamento estoura o
 * orçamento — que é o que **travou todo deploy da staging** quando o trilho de anexo do agregado
 * nasceu com o publisher dele fora do grupo de fechamento. Nove deploys seguidos falharam, de três
 * specs diferentes, e nenhum gate de unidade pegava: o contrato de `WorkerShutdown` testa a classe
 * isolada, e a fiação esquecida mora no `main.ts`.
 *
 * Esta varredura é por **texto de fonte** de propósito: o defeito é uma ausência na composição, e
 * ausência não tem como ser exercitada por teste de comportamento sem subir o processo inteiro.
 */
const MAIN_URL = new URL('../../src/main.ts', import.meta.url)

/**
 * O grupo do `catch` de boot é o segundo lugar, e é tão fácil de esquecer quanto o primeiro — ele só
 * corre quando a subida falha no meio, que é justamente quando ninguém está olhando.
 */
const DECLARATION = /^ {2}let ([A-Za-z][A-Za-z0-9]*): RabbitMqProvider(?: \| undefined)?$/gmu

describe('toda conexão de broker fecha no desligamento (main.ts)', () => {
  test('every RabbitMQ provider declared is closed by the shutdown group', async () => {
    const source = await readFile(MAIN_URL, 'utf8')
    const declared = [...source.matchAll(DECLARATION)].map((match) => match[1] as string)

    /** Se a declaração mudar de forma, a varredura para de achar e passaria vazia — sem provar nada. */
    expect(declared.length).toBeGreaterThan(5)

    /**
     * O desligamento fecha por **duas** listas — `closeables` e `provider` —, e as duas valem: o
     * roteirizador entra na primeira porque é opcional. Varrer só uma reprovaria fiação correta.
     */
    const shutdownWiring = between(source, 'const shutdown = new WorkerShutdown({', '\n    })')

    for (const name of declared) {
      expect(shutdownWiring).toContain(name)
    }
  })

  test('every RabbitMQ provider is also closed when the boot fails halfway', async () => {
    const source = await readFile(MAIN_URL, 'utf8')
    const declared = [...source.matchAll(DECLARATION)].map((match) => match[1] as string)
    const bootFailure = source.slice(source.indexOf('} catch (error: unknown) {'))

    for (const name of declared) {
      /**
       * `provider` fecha por outro caminho no `catch`; os demais fecham por `close()` explícito.
       * Exigir a mesma forma de todos transformaria a guarda em ruído.
       */
      if (name === 'provider') continue
      expect(bootFailure).toContain(`${name}?.close()`)
    }
  })
})

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start)
  expect(from).toBeGreaterThan(-1)
  const to = source.indexOf(end, from)
  expect(to).toBeGreaterThan(from)

  return source.slice(from, to)
}
