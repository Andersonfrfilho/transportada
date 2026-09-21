/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O vínculo de nota na viagem recongela rota e pedágio no servidor, enfileira o recálculo da planta
 * de carga no worker e o valuation é calculado na leitura — invalidar essas telas é o que dispara o
 * recálculo na tela de detalhe. Contrato de fonte, por função, no molde de
 * `test/shared/mutation-invalidation.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const HOOK = new URL('../../src/modules/trip/hooks/useTripWorkspace.hook.ts', import.meta.url)

function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('\n  }', start)
  return source.slice(start, end)
}

describe('invalidação disparada ao vincular uma nota na viagem', () => {
  const source = readFileSync(HOOK, 'utf8')
  const body = extractFunctionBody(source, 'async function invalidateDocumentLink')

  it('continua disparando o efeito compartilhado de vínculo de nota', () => {
    expect(body).toInclude('MUTATION_EFFECT.nfeDocumentLink')
  })

  it('passa a disparar o efeito da carga da viagem', () => {
    expect(body).toInclude('MUTATION_EFFECT.tripCargoLink')
  })

  it('dispara os dois efeitos por invalidateMutationEffect, sem lista de chave montada à mão', () => {
    const occurrences = body.match(/invalidateMutationEffect/g) ?? []
    expect(occurrences.length).toBe(2)
  })
})
