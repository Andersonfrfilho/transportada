/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createResolveLoginHintUseCase } from '../../src/identity/application/resolve-login-hint.use-case.js'
import {
  parseLoginIdentifier,
  resolveLoginHint,
} from '../../src/identity/domain/login-identifier.policy.js'

function createUseCase(candidates: readonly { username: string }[]) {
  return createResolveLoginHintUseCase({
    repository: {
      async findByIdentifier() {
        return candidates
      },
    },
  })
}

describe('o que a pessoa digitou', () => {
  test('o arroba decide o e-mail, e a caixa não é identidade', () => {
    expect(parseLoginIdentifier('  Ana@Empresa.TEST ')).toEqual({
      kind: 'email',
      value: 'ana@empresa.test',
    })
  })

  /**
   * Onze dígitos são ambíguos: um CPF e um celular têm o mesmo comprimento. Documento vem antes
   * porque é o identificador mais específico de uma pessoa, e quem digita onze dígitos num campo de
   * login quase sempre está digitando o CPF.
   */
  test('onze dígitos são documento, não telefone', () => {
    expect(parseLoginIdentifier('123.456.789-09')).toEqual({
      kind: 'document',
      value: '12345678909',
    })
  })

  test('o CNPJ com letra entra inteiro, sem virar telefone', () => {
    expect(parseLoginIdentifier('12.ABC.678/0001-90')).toEqual({
      kind: 'document',
      value: '12abc678000190',
    })
  })

  test('dez dígitos são telefone fixo com DDD', () => {
    expect(parseLoginIdentifier('(11) 3333-4444')).toEqual({ kind: 'phone', value: '1133334444' })
  })

  /** Quem digita o próprio `username` não passa por busca nenhuma: segue como sempre foi. */
  test('o que não é nenhum dos três não vira palpite', () => {
    expect(parseLoginIdentifier('ana.fiscal')).toBeUndefined()
    expect(parseLoginIdentifier('   ')).toBeUndefined()
    expect(parseLoginIdentifier('123')).toBeUndefined()
  })
})

/**
 * A etapa é anônima: quem pergunta ainda não provou ser ninguém. Dizer "não encontrado" entregaria a
 * base de e-mails, CPFs e telefones a quem tivesse um script e paciência — e esta API não tem
 * limitador. É a mesma decisão que `POST /password-resets` já tomou, pelo mesmo motivo.
 */
describe('a resposta não conta quem existe', () => {
  test('achou: devolve o login canônico', async () => {
    const resolution = await createUseCase([{ username: 'ana.fiscal' }]).execute({
      typed: 'ana@empresa.test',
    })

    expect(resolution.loginHint).toBe('ana.fiscal')
  })

  test('não achou: devolve o que foi digitado, e o provedor recusa como sempre', async () => {
    const resolution = await createUseCase([]).execute({ typed: 'ninguem@empresa.test' })

    expect(resolution.loginHint).toBe('ninguem@empresa.test')
  })

  test('a forma da resposta é a mesma nos dois casos', async () => {
    const achou = await createUseCase([{ username: 'ana.fiscal' }]).execute({
      typed: 'ana@empresa.test',
    })
    const naoAchou = await createUseCase([]).execute({ typed: 'ninguem@empresa.test' })

    expect(Object.keys(achou).sort()).toEqual(Object.keys(naoAchou).sort())
    expect(typeof achou.loginHint).toBe(typeof naoAchou.loginHint)
  })

  /**
   * Telefone é compartilhado no mundo real — o agregado que usa o número da empresa, a dupla com um
   * aparelho só. Escolher uma das duas em silêncio mandaria alguém tentar a senha na conta do colega.
   */
  test('identificador de duas pessoas não resolve para nenhuma', async () => {
    const resolution = await createUseCase([
      { username: 'ana.fiscal' },
      { username: 'joao.motorista' },
    ]).execute({ typed: '11999998888' })

    expect(resolution.loginHint).toBe('11999998888')
    expect(resolution.matched).toBe(false)
  })

  test('perfil sem login não vira login vazio', () => {
    const resolution = resolveLoginHint({ candidates: [{ username: '' }], typed: 'ana@x.test' })

    expect(resolution.loginHint).toBe('ana@x.test')
    expect(resolution.matched).toBe(false)
  })

  /** O que segue ao provedor nunca é vazio: campo em branco na tela dele não diz nada a ninguém. */
  test('o palpite nunca sai vazio', async () => {
    const resolution = await createUseCase([]).execute({ typed: '  ana@empresa.test  ' })

    expect(resolution.loginHint).toBe('ana@empresa.test')
  })
})
