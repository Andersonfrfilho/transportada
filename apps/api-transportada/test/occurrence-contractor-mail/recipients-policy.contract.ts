/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.7 (ADR-0108, D13): o `To` do e-mail à contratante num tipo com destinatários escolhidos. Política pura:
 * só vale quem é da contratante da nota, ativo, recebe ocorrências e tem e-mail; a escolha ignora a etapa; sem
 * nenhum escolhido que sobre, vale a regra de hoje (contatos da etapa).
 */
import { describe, expect, test } from 'bun:test'

import { resolveOccurrenceRecipients } from '../../src/occurrence-conversation/domain/occurrence-contractor-recipients.policy.js'

/** Os contatos **ativos** da contratante da nota que recebem ocorrências — o que o leitor já traz. */
const CONTACTS = [
  { email: 'compras@alfa.example.test', id: 'contact-delivery', occurrenceStages: ['delivery'] },
  {
    email: 'expedicao@alfa.example.test',
    id: 'contact-separation',
    occurrenceStages: ['separation'],
  },
  { email: '', id: 'contact-no-email', occurrenceStages: ['delivery'] },
  { email: 'parada@alfa.example.test', id: 'contact-stop', occurrenceStages: ['stop'] },
] as const

function resolve(chosenContactIds: readonly string[], stage = 'delivery') {
  return resolveOccurrenceRecipients({ chosenContactIds, contacts: CONTACTS, stage })
}

describe('o To do e-mail à contratante com destinatários escolhidos (spec 271 D13)', () => {
  test('sem escolha, vale a regra de hoje: os contatos da etapa', () => {
    expect(resolve([])).toEqual({
      contactIds: ['contact-delivery', 'contact-no-email'],
      source: 'stage',
    })
  })

  test('escolhidos da contratante da nota, ignorando a etapa deles', () => {
    expect(resolve(['contact-separation'])).toEqual({
      contactIds: ['contact-separation'],
      source: 'chosen',
    })
  })

  test('na ordem do cadastro de contatos, não na da escolha', () => {
    expect(resolve(['contact-stop', 'contact-delivery']).contactIds).toEqual([
      'contact-delivery',
      'contact-stop',
    ])
  })

  test('escolhido de outra contratante, inativo ou que não recebe ocorrências não está na lista: cai', () => {
    expect(resolve(['contact-of-another-contractor'])).toEqual({
      contactIds: ['contact-delivery', 'contact-no-email'],
      source: 'stage',
    })
  })

  test('escolhido sem e-mail cai; sobrando outro escolhido, só ele vai', () => {
    expect(resolve(['contact-no-email', 'contact-separation'])).toEqual({
      contactIds: ['contact-separation'],
      source: 'chosen',
    })
  })

  test('nenhum escolhido que sobre: a regra de hoje, não "ninguém"', () => {
    expect(resolve(['contact-no-email'])).toEqual({
      contactIds: ['contact-delivery', 'contact-no-email'],
      source: 'stage',
    })
  })

  test('na etapa de parada vale o mesmo contrato', () => {
    expect(resolve([], 'stop')).toEqual({ contactIds: ['contact-stop'], source: 'stage' })
  })
})
