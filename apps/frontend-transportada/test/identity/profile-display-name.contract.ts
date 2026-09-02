/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { deriveIdentityProfile } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

describe('nome do cabeçalho na grafia que se lê', () => {
  test('sobe a primeira letra de cada nome do claim', () => {
    expect(deriveIdentityProfile({ name: 'anderson fernandes' }).displayName).toBe(
      'Anderson Fernandes',
    )
  })

  test('a ligação fica minúscula', () => {
    expect(deriveIdentityProfile({ name: 'JOSÉ DA SILVA' }).displayName).toBe('José da Silva')
  })

  /**
   * Sem o claim `name` o que sobra é login ou e-mail, e nenhum dos dois é nome de pessoa:
   * subir a caixa deles produziria `Anderson.filho@adatechnology.com.br` no cabeçalho.
   */
  test('e-mail no lugar do nome não é recapitalizado', () => {
    expect(
      deriveIdentityProfile({ email: 'anderson.filho@adatechnology.com.br' }).displayName,
    ).toBe('anderson.filho@adatechnology.com.br')
  })

  test('login no lugar do nome não é recapitalizado', () => {
    expect(deriveIdentityProfile({ preferred_username: 'anderson.filho' }).displayName).toBe(
      'anderson.filho',
    )
  })

  test('as iniciais saem do nome já na grafia de tela', () => {
    expect(deriveIdentityProfile({ name: 'anderson fernandes' }).initials).toBe('AF')
  })

  /** O subtítulo é o e-mail e continua intocado — ele não é nome. */
  test('o subtítulo continua o e-mail cru', () => {
    expect(
      deriveIdentityProfile({
        email: 'anderson.filho@adatechnology.com.br',
        name: 'anderson fernandes',
      }).subtitle,
    ).toBe('anderson.filho@adatechnology.com.br')
  })
})
