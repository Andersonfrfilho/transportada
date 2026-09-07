/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { formatStoredPhone } from '../../src/modules/shared/phone.service'

/**
 * O `<fone>` da NF-e não é campo mascarado: o emitente escreve o que quer. Este formatador existe
 * porque o `formatPhone` — a máscara de quem **digita** — assume DDD nos dois primeiros dígitos, e
 * essa suposição é falsa em metade dos telefones que chegam pela nota.
 */
describe('telefone guardado, formatado para leitura', () => {
  test('põe DDD quando o número tem DDD', () => {
    expect(formatStoredPhone('1639771234')).toBe('(16) 3977-1234')
    expect(formatStoredPhone('16999771234')).toBe('(16) 99977-1234')
  })

  test('aceita o número já pontuado como o emitente o escreveu', () => {
    expect(formatStoredPhone('(16) 3977-1234')).toBe('(16) 3977-1234')
  })

  /**
   * ⚠️ O caso que motivou a função. Oito ou nove dígitos são telefone **sem** DDD, e a máscara de
   * digitação leria `39771234` como `(39) 771234` — um DDD de Minas num telefone de Ribeirão Preto,
   * plausível o bastante para alguém discar.
   */
  test('não inventa DDD em número local', () => {
    expect(formatStoredPhone('39771234')).toBe('3977-1234')
    expect(formatStoredPhone('999771234')).toBe('99977-1234')
  })

  /**
   * Contagem desconhecida — ramal, número internacional, lixo digitado — sai **como veio**. Telefone
   * estranho impresso cru é conferível; remendado até caber numa máscara é indistinguível de um certo.
   */
  test('devolve intacto o que não cabe em nenhuma das quatro formas', () => {
    expect(formatStoredPhone('+55 16 3977-1234 r. 22')).toBe('+55 16 3977-1234 r. 22')
    expect(formatStoredPhone('12345')).toBe('12345')
    expect(formatStoredPhone('  ')).toBe('')
  })
})
