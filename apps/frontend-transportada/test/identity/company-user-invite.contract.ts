/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  collectInviteIssues,
  findInviteIssue,
  INVITE_FIELD,
  INVITE_ISSUE,
  resolveInviteContact,
  resolveInviteContactField,
} from '../../src/modules/identity/shared/companyUserInvite.service'

const DRAFT = {
  channel: 'email',
  email: '',
  name: '',
  phone: '',
  roles: ['operator'],
  taxId: '',
} as const

/**
 * O botão de enviar deixou de gatear a tela: quem diz o que falta é esta lista, e ela é o que o
 * aviso imprime e o que ancora o erro no campo. Sem ela o convite voltou a ser um botão apagado
 * sem explicação — foi assim que ninguém conseguiu criar usuário em homologação.
 */
describe('o canal escolhe o campo de contato', () => {
  test('e-mail cobra o campo de e-mail', () => {
    expect(resolveInviteContactField('email')).toBe(INVITE_FIELD.EMAIL)
  })

  test('SMS e WhatsApp cobram o telefone', () => {
    expect(resolveInviteContactField('sms')).toBe(INVITE_FIELD.PHONE)
    expect(resolveInviteContactField('whatsapp')).toBe(INVITE_FIELD.PHONE)
  })

  /** Canal desconhecido não pode travar a tela: o e-mail é o caminho que sempre existe. */
  test('canal desconhecido cai no e-mail', () => {
    expect(resolveInviteContactField('pombo-correio')).toBe(INVITE_FIELD.EMAIL)
  })

  test('o contato sai do campo que o canal escolheu, e o telefone vai sem máscara', () => {
    expect(
      resolveInviteContact({ ...DRAFT, email: ' ana@example.test ', phone: '(11) 98765-4321' }),
    ).toBe('ana@example.test')
    expect(
      resolveInviteContact({
        ...DRAFT,
        channel: 'whatsapp',
        email: 'ana@example.test',
        phone: '(11) 98765-4321',
      }),
    ).toBe('11987654321')
  })
})

describe('o que falta para o convite sair', () => {
  test('formulário em branco cobra nome e o contato do canal, nesta ordem', () => {
    expect(collectInviteIssues(DRAFT)).toEqual([
      { code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.NAME },
      { code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.EMAIL },
    ])
  })

  test('com canal de telefone é o telefone que é cobrado, não o e-mail', () => {
    const issues = collectInviteIssues({ ...DRAFT, channel: 'sms', name: 'Ana' })
    expect(issues).toEqual([{ code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.PHONE }])
  })

  test('nome e contato preenchidos bastam', () => {
    expect(collectInviteIssues({ ...DRAFT, email: 'ana@example.test', name: 'Ana' })).toEqual([])
  })

  test('sem papel nenhum o convite não sai', () => {
    const issues = collectInviteIssues({
      ...DRAFT,
      email: 'ana@example.test',
      name: 'Ana',
      roles: [],
    })
    expect(findInviteIssue(issues, INVITE_FIELD.ROLES)?.code).toBe(INVITE_ISSUE.REQUIRED)
  })

  /** Campo opcional pela metade é o caso que travava o botão sem dizer nada. */
  test('telefone e CPF pela metade acusam incompleto, e vazios não acusam nada', () => {
    const filled = { ...DRAFT, email: 'ana@example.test', name: 'Ana' }
    expect(
      findInviteIssue(collectInviteIssues({ ...filled, phone: '(11) 9876' }), INVITE_FIELD.PHONE)
        ?.code,
    ).toBe(INVITE_ISSUE.INCOMPLETE)
    expect(
      findInviteIssue(collectInviteIssues({ ...filled, taxId: '123.456' }), INVITE_FIELD.TAX_ID)
        ?.code,
    ).toBe(INVITE_ISSUE.INCOMPLETE)
    expect(collectInviteIssues(filled)).toEqual([])
  })

  test('e-mail malformado acusa inválido, não ausência', () => {
    const issues = collectInviteIssues({ ...DRAFT, email: 'ana@', name: 'Ana' })
    expect(issues).toEqual([{ code: INVITE_ISSUE.INVALID, field: INVITE_FIELD.EMAIL }])
  })
})
