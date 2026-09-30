/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
/**
 * Spec 220 RF28: o motivo da recusa do canhoto é texto livre que alguém digita com pressa, e
 * acaba virando "ligar para o João, 11 98888-7777". A guarda mora em `src/shared/` de propósito:
 * a spec 162 (expurgo de armazenamento) precisa da mesma regra, e duas cópias divergem.
 *
 * O detector é conservador com o que **não** é dado pessoal: número de nota fiscal (9 dígitos),
 * peso, prazo e valor precisam passar, ou a guarda vira um obstáculo que se aprende a driblar.
 */
import { describe, expect, test } from 'bun:test'

import { detectPersonalData, PersonalDataKind } from '../../src/shared/personal-data.policy.js'

describe('o que a guarda recusa (RF28)', () => {
  test('e-mail, em qualquer lugar da frase', () => {
    expect(detectPersonalData('falar com contato@transportadora.com.br antes de refazer')).toBe(
      PersonalDataKind.EMAIL,
    )
  })

  test('CNPJ, pontuado ou cru', () => {
    expect(detectPersonalData('emitente 12.345.678/0001-99 recusou')).toBe(PersonalDataKind.CNPJ)
    expect(detectPersonalData('emitente 12345678000199 recusou')).toBe(PersonalDataKind.CNPJ)
  })

  test('CPF, pontuado ou cru', () => {
    expect(detectPersonalData('recebedor 123.456.789-09 assinou por fora')).toBe(
      PersonalDataKind.CPF,
    )
    expect(detectPersonalData('recebedor 12345678909 assinou por fora')).toBe(PersonalDataKind.CPF)
  })

  test('CEP', () => {
    expect(detectPersonalData('entregar no 01310-100, portaria dos fundos')).toBe(
      PersonalDataKind.POSTAL_CODE,
    )
  })

  test('telefone, com e sem DDI', () => {
    expect(detectPersonalData('ligar (11) 98888-7777 para combinar')).toBe(PersonalDataKind.PHONE)
    expect(detectPersonalData('ligar +55 11 98888-7777 para combinar')).toBe(PersonalDataKind.PHONE)
  })

  test('telefone continua detectado em todas as formas de escrita', () => {
    for (const phone of ['(11) 98765-4321', '11987654321', '+55 11 98765-4321', '11 9876-5432']) {
      expect(detectPersonalData(`ligar ${phone} hoje`)).not.toBeUndefined()
      expect(detectPersonalData(phone)).not.toBeUndefined()
    }
  })

  test('onze dígitos crus são recusados — CPF ou celular, os dois são dado pessoal', () => {
    expect(detectPersonalData('anotar 11988887777')).not.toBeUndefined()
  })
})

describe('o que a guarda deixa passar', () => {
  const ACCEPTED_REASONS = [
    'canhoto ilegível, refazer a foto com mais luz',
    'assinatura do recebedor não aparece na foto enviada',
    'foto da nota 000123456, e não do canhoto assinado',
    'chegou 2 horas depois do combinado, recusa registrada',
    'faltaram 3 volumes dos 12 da carga, conferir antes',
    'valor cobrado a maior: R$ 1.234,56 em vez de R$ 987,00',
  ] as const

  test('motivo legítimo não é confundido com dado pessoal', () => {
    for (const reason of ACCEPTED_REASONS) {
      expect(detectPersonalData(reason)).toBeUndefined()
    }
  })

  test('sequência longa de dígitos não vira telefone só porque o final dela parece um', () => {
    const accessKey = '35260912345678000199550010000012341000012345'
    expect(detectPersonalData(`a chave ${accessKey} não bate com a nota`)).toBeUndefined()
    expect(detectPersonalData('protocolo 202609301234')).toBeUndefined()
    expect(detectPersonalData('nota 123456789 ilegível')).toBeUndefined()
  })

  test('texto vazio não acusa nada — quem recusa vazio cai na validação do motivo', () => {
    expect(detectPersonalData('')).toBeUndefined()
  })
})

describe('a categoria devolvida serve à mensagem, não ao log', () => {
  test('nenhuma categoria carrega o valor encontrado', () => {
    const detected = detectPersonalData('contato@transportadora.com.br') ?? ''
    expect(Object.values<string>(PersonalDataKind)).toContain(detected)
  })

  test('as cinco categorias do enunciado existem e são estáveis', () => {
    expect(PersonalDataKind).toEqual({
      CNPJ: 'cnpj',
      CPF: 'cpf',
      EMAIL: 'email',
      PHONE: 'phone',
      POSTAL_CODE: 'postalCode',
    })
  })
})
