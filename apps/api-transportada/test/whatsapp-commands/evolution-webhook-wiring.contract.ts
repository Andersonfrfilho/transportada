/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quem tem `expenses.manage` e também é motorista só vê "Lançar conta" no 1:1 se o webhook real do Evolution recebe o
 * `resolveActor` (é ele que monta `findDirectExpenseLauncher`). Em 15/11/2026 a composição de `createAnonymousRoutes` o
 * esquecia: os contratos do desvio passavam (ligavam a porta à mão) e o desvio nunca existiu em produção. Este contrato
 * cobra as duas pontas: toda chamada de `createEvolutionWebhook` em `main.ts` passa `resolveActor`.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const MAIN = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8')

function callBodies(): readonly string[] {
  const bodies: string[] = []
  let from = 0
  for (;;) {
    const start = MAIN.indexOf('createEvolutionWebhook({', from)
    if (start === -1) break
    let depth = 0
    let end = start
    for (let index = MAIN.indexOf('{', start); index < MAIN.length; index += 1) {
      if (MAIN[index] === '{') depth += 1
      if (MAIN[index] === '}') depth -= 1
      if (depth === 0) {
        end = index
        break
      }
    }
    bodies.push(MAIN.slice(start, end))
    from = end
  }
  return bodies
}

describe('composição do webhook do Evolution', () => {
  test('toda chamada de createEvolutionWebhook passa resolveActor', () => {
    const bodies = callBodies()
    expect(bodies.length).toBeGreaterThanOrEqual(2)
    for (const body of bodies) expect(body).toContain('resolveActor')
  })

  test('a entrega pública (a que atende o 1:1 real) liga o assistente de contas; a rota do dono não', () => {
    const [publicDelivery, ownerRoute] = callBodies()
    expect(publicDelivery).toContain('directAssistant: evolutionAssistantFactory')
    expect(ownerRoute).not.toContain('directAssistant')
  })
})
