/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1: cada passo guardado no pedido do grupo tem um só dono. O registro declara os passos de cada
 * fluxo; dois fluxos com o mesmo nome de passo (já qualificado pelo prefixo) quebram este contrato.
 */
import { describe, expect, test } from 'bun:test'

import {
  findDuplicateGroupSteps,
  GROUP_STEP_REGISTRY,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'

describe('registro dos passos do grupo', () => {
  test('nenhum nome de passo qualificado é declarado por dois fluxos', () => {
    expect(findDuplicateGroupSteps(GROUP_STEP_REGISTRY)).toEqual([])
  })

  test('o contrato acusa dois fluxos com o mesmo passo', () => {
    const colliding = [
      ...GROUP_STEP_REGISTRY,
      { owner: 'intruder', prefix: '', steps: ['location'] },
    ]
    expect(findDuplicateGroupSteps(colliding)).toEqual(['location'])
  })

  test('o fluxo sem prefixo (ocorrência) não usa o prefixo de outro fluxo nem o passo do menu', () => {
    const bare = GROUP_STEP_REGISTRY.filter((entry) => entry.prefix === '')
    expect(bare.map((entry) => entry.owner)).toEqual(['menu', 'occurrence'])
    const prefixes = GROUP_STEP_REGISTRY.map((entry) => entry.prefix).filter((p) => p !== '')
    for (const step of bare.flatMap((entry) => entry.steps)) {
      expect(prefixes.some((prefix) => step.startsWith(prefix))).toBe(false)
    }
  })
})
