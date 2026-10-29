/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T4 (RF2): as regras puras do bloco "Retorno ao cliente" — a troca que cada controle grava, os modelos que cada
 * canal oferece e o aviso do canal que não vai sair. Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import type { ClientChannelTemplateChoice } from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'
import {
  CLIENT_RETURN_SAMPLE_VALUES,
  isClientReturnChannelLocked,
  listClientReturnTemplates,
  resolveClientReturnProblem,
  selectClientReturnSendMode,
  selectClientReturnTemplate,
  toggleClientReturnChannel,
} from '@/modules/trip/shared/occurrenceClientReturn.service'
import type { ClientReturnMatrix } from '@/modules/trip/shared/occurrenceContractorReply.constant'

const MATRIX: ClientReturnMatrix = {
  email: { enabled: true, sendMode: 'automatic', templateKey: 'a.email' },
  whatsapp: { enabled: false, sendMode: 'manual', templateKey: null },
}

function choice(overrides: Partial<ClientChannelTemplateChoice>): ClientChannelTemplateChoice {
  return {
    body: 'corpo',
    channel: 'email',
    key: 'a.email',
    problems: [],
    subject: 'assunto',
    usable: true,
    version: 1,
    ...overrides,
  }
}

describe('a troca que cada controle grava (spec 286 T4)', () => {
  test('manda só o canal mexido, inteiro, e nunca o outro', () => {
    expect(toggleClientReturnChannel(MATRIX, 'whatsapp', true)).toEqual({
      clientChannels: { whatsapp: { enabled: true, sendMode: 'manual', templateKey: null } },
    })
    expect(selectClientReturnTemplate(MATRIX, 'email', null)).toEqual({
      clientChannels: { email: { enabled: true, sendMode: 'automatic', templateKey: null } },
    })
    expect(selectClientReturnSendMode(MATRIX, 'email', 'manual')).toEqual({
      clientChannels: { email: { enabled: true, sendMode: 'manual', templateKey: 'a.email' } },
    })
  })
})

describe('o e-mail travado e os modelos por canal (spec 286 T4)', () => {
  test('só o e-mail trava, e só com o tipo de e-mail do cliente em off', () => {
    expect(isClientReturnChannelLocked('email', 'off')).toBe(true)
    expect(isClientReturnChannelLocked('email', 'boleto')).toBe(false)
    expect(isClientReturnChannelLocked('email', undefined)).toBe(false)
    expect(isClientReturnChannelLocked('whatsapp', 'off')).toBe(false)
  })

  test('lista os do canal, utilizáveis e o já escolhido, por chave', () => {
    const choices = [
      choice({ key: 'z.email' }),
      choice({ key: 'a.email' }),
      choice({ key: 'ruim.email', usable: false, problems: [{ code: 'empty_subject' }] }),
      choice({ channel: 'whatsapp', key: 'w.zap', subject: null }),
    ]

    expect(listClientReturnTemplates(choices, 'email', null).map((item) => item.key)).toEqual([
      'a.email',
      'z.email',
    ])
    expect(
      listClientReturnTemplates(choices, 'email', 'ruim.email').map((item) => item.key),
    ).toEqual(['a.email', 'ruim.email', 'z.email'])
    expect(listClientReturnTemplates(choices, 'whatsapp', null).map((item) => item.key)).toEqual([
      'w.zap',
    ])
  })
})

describe('o aviso do canal que não vai sair (spec 286 T4)', () => {
  const setting = { enabled: true, sendMode: 'manual', templateKey: 'x' } as const

  test('canal desligado nunca avisa', () => {
    expect(
      resolveClientReturnProblem({
        channel: 'email',
        choices: [],
        setting: { ...setting, enabled: false, templateKey: null },
      }),
    ).toBeNull()
  })

  test('ligado sem chave: falta o modelo', () => {
    expect(
      resolveClientReturnProblem({
        channel: 'email',
        choices: [],
        setting: { ...setting, templateKey: null },
      }),
    ).toEqual({ kind: 'missing' })
  })

  test('a lista ainda não chegou: não afirma que o modelo sumiu', () => {
    expect(resolveClientReturnProblem({ channel: 'email', choices: undefined, setting })).toBeNull()
  })

  test('a chave não está na lista do canal: o modelo sumiu (mesmo existindo no outro canal)', () => {
    expect(
      resolveClientReturnProblem({
        channel: 'whatsapp',
        choices: [choice({ key: 'x', channel: 'email' })],
        setting,
      }),
    ).toEqual({ kind: 'not_found' })
  })

  test('modelo que deixou de servir leva os motivos; o utilizável não avisa', () => {
    expect(
      resolveClientReturnProblem({
        channel: 'email',
        choices: [choice({ key: 'x', usable: false, problems: [{ code: 'system_key' }] })],
        setting,
      }),
    ).toEqual({ codes: ['system_key'], kind: 'unusable' })
    expect(
      resolveClientReturnProblem({ channel: 'email', choices: [choice({ key: 'x' })], setting }),
    ).toBeNull()
  })
})

describe('a prévia do boleto ao cliente (spec 286)', () => {
  test('os exemplos cobrem os dados da transportadora do modelo do canal', () => {
    for (const name of [
      'razaoSocialTransportadora',
      'cnpjTransportadora',
      'cidadeTransportadora',
      'enderecoTransportadora',
      'telefoneTransportadora',
      'emailTransportadora',
    ]) {
      expect(CLIENT_RETURN_SAMPLE_VALUES[name]).not.toBe('')
      expect(CLIENT_RETURN_SAMPLE_VALUES[name]).toBeDefined()
    }
  })
})
