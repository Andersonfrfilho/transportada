/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { projectLoginIdentifiers } from '../../src/identity/domain/login-identifier-projection.policy.js'

const PROFILE = {
  contactAddress: 'convite@empresa.test',
  contactChannel: 'email',
  email: 'acesso@empresa.test',
  phone: '11999998888',
  taxId: '12345678909',
} as const

/**
 * A tabela `login_identifiers` existia, era lida pela tela de login e pela listagem, e **nunca era
 * escrita**: criada sem backfill e sem escritor. A tela que promete "digite o que você lembra" não
 * resolvia ninguém, e a lista de e-mails da pessoa vinha sempre vazia.
 */
describe('por onde a pessoa pode se identificar', () => {
  test('os dois endereços entram, e nenhum sobrescreve o outro', () => {
    const emails = projectLoginIdentifiers(PROFILE)
      .filter((entry) => entry.kind === 'email')
      .map((entry) => entry.value)

    expect(emails).toEqual(['acesso@empresa.test', 'convite@empresa.test'])
  })

  test('documento e telefone também são caminhos de identificação', () => {
    const projected = projectLoginIdentifiers(PROFILE)

    expect(projected).toContainEqual({ kind: 'document', value: '12345678909' })
    expect(projected).toContainEqual({ kind: 'phone', value: '11999998888' })
  })

  /** Telefone no campo de contato viraria e-mail que nunca casa com nada. */
  test('o contato só vira e-mail quando o canal diz que é', () => {
    const emails = projectLoginIdentifiers({
      ...PROFILE,
      contactAddress: '11988887777',
      contactChannel: 'phone',
    }).filter((entry) => entry.kind === 'email')

    expect(emails).toEqual([{ kind: 'email', value: 'acesso@empresa.test' }])
  })

  /** O unique é `(usuário, tipo, valor)`: o mesmo endereço nos dois campos é uma entrada só. */
  test('o mesmo endereço nos dois campos não vira duas linhas', () => {
    const projected = projectLoginIdentifiers({
      ...PROFILE,
      contactAddress: PROFILE.email,
    })

    expect(projected.filter((entry) => entry.kind === 'email')).toHaveLength(1)
  })

  /** O CHECK exige `value = lower(btrim(value))`: o banco recusaria a linha antes da busca falhar. */
  test('o valor é normalizado como o banco exige', () => {
    const projected = projectLoginIdentifiers({
      ...PROFILE,
      contactAddress: '  Convite@Empresa.TEST ',
      email: '  Acesso@Empresa.TEST ',
    })

    expect(projected.filter((entry) => entry.kind === 'email').map((entry) => entry.value)).toEqual(
      ['acesso@empresa.test', 'convite@empresa.test'],
    )
  })

  test('campo vazio não vira identificador', () => {
    const projected = projectLoginIdentifiers({
      contactAddress: '',
      contactChannel: 'email',
      email: '',
      phone: '',
      taxId: '',
    })

    expect(projected).toEqual([])
  })
})

/**
 * A projeção vive ao lado de **toda** escrita de perfil, e não em cada caso de uso: manter a tabela
 * por lembrança foi exatamente o que produziu a tabela vazia. Um caminho de escrita novo que a
 * esqueça reintroduz o defeito em silêncio — nada quebra, a pessoa só some da busca.
 */
describe('toda escrita de perfil reconstrói a projeção', () => {
  const source = readFileSync(
    'src/identity/infrastructure/drizzle-company-user.repository.ts',
    'utf8',
  )

  test('os três caminhos de escrita chamam a reconstrução', () => {
    const writes =
      source.split('insert(identityUserProfiles').length -
      1 +
      (source.split('update(identityUserProfiles').length - 1)
    const rebuilds = source.split('rebuildLoginIdentifiers(').length - 2

    expect(writes).toBeGreaterThan(0)
    expect(rebuilds).toBe(writes)
  })

  /** No convite a reconstrução tem de estar na mesma transação: fora dela, ficha e atalho divergem. */
  test('no convite ela roda dentro da transação', () => {
    expect(source).toContain('await rebuildLoginIdentifiers(transaction, input.userId)')
  })
})
