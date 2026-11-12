/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 281 T8 (D4/D13): o número que o motorista digita é conferido na tela de confirmação antes de qualquer envio. A
 * leitura é cópia por valor da regra da API (a validação final é dela); o teste lê o arquivo-fonte da API, nunca importa.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  CLIENT_WHATSAPP_NUMBER_PATTERNS,
  formatClientWhatsAppNumber,
  parseClientWhatsAppNumber,
} from '../../src/modules/client-whatsapp/shared/clientBoletoWhatsAppNumber.service'

const API_POLICY_PATH = resolve(
  import.meta.dir,
  '../../../api-transportada/src/occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.ts',
)
const API_CONSTANT_PATH = resolve(
  import.meta.dir,
  '../../../api-transportada/src/shared/delivery-client-email.constant.ts',
)

describe('número de WhatsApp do cliente no app do motorista (spec 281 T8)', () => {
  it.each([
    ['(16) 99999-8888', '+5516999998888'],
    ['16999998888', '+5516999998888'],
    ['+55 16 99999-8888', '+5516999998888'],
    ['016 3322-1100', '+551633221100'],
  ])('normaliza %s para %s', (typed, expected) => {
    expect(parseClientWhatsAppNumber(typed)).toBe(expected)
  })

  it.each(['', 'abc', '99999-8888', '(16) 19999-8888', '+55 16 9999', '11 99999-8888 ramal 2'])(
    'recusa %s',
    (typed) => {
      expect(parseClientWhatsAppNumber(typed)).toBeNull()
    },
  )

  it('mostra o número como a pessoa o lê', () => {
    expect(formatClientWhatsAppNumber('+5516999998888')).toBe('+55 (16) 99999-8888')
    expect(formatClientWhatsAppNumber('+551633221100')).toBe('+55 (16) 3322-1100')
    expect(formatClientWhatsAppNumber('+351912345678')).toBe('+351912345678')
  })

  it('usa as mesmas expressões da API', () => {
    if (!existsSync(API_POLICY_PATH)) return
    const policy = readFileSync(API_POLICY_PATH, 'utf8')
    expect(policy).toContain(
      `BRAZIL_NATIONAL = /${CLIENT_WHATSAPP_NUMBER_PATTERNS.brazilNational}/u`,
    )
    const constant = readFileSync(API_CONSTANT_PATH, 'utf8')
    expect(constant).toContain(CLIENT_WHATSAPP_NUMBER_PATTERNS.e164.replace(/^\^|\$$/gu, ''))
  })
})
