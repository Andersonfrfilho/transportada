/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  forgetLoginIdentifier,
  readRememberedLoginIdentifier,
  rememberLoginIdentifier,
  type LoginIdentifierStorage,
} from '../../src/modules/identity/shared/loginIdentifierMemory.service'

const SOURCE_ROOT = new URL('../../src/', import.meta.url)

function readSource(path: string): string {
  return readFileSync(new URL(path, SOURCE_ROOT), 'utf8')
}

function createMemoryStorage(): LoginIdentifierStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

const UNAVAILABLE_STORAGE: LoginIdentifierStorage = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
}

/**
 * Quem volta da tela de senha pelo "Trocar de usuário" costuma ter errado por pouco — um dígito do
 * CPF, o e-mail de outro domínio. O campo volta com o que foi digitado, para corrigir em vez de
 * digitar tudo de novo.
 */
describe('login identifier memory contract', () => {
  test('returns what was typed, trimmed', () => {
    const storage = createMemoryStorage()

    rememberLoginIdentifier(' 123.456.789-09 ', storage)

    expect(readRememberedLoginIdentifier(storage)).toBe('123.456.789-09')
  })

  test('starts empty when nothing was typed in this tab', () => {
    expect(readRememberedLoginIdentifier(createMemoryStorage())).toBe('')
  })

  /** Depois de entrar, o identificador não tem mais serventia e é dado pessoal: sai da aba. */
  test('forgets the identifier', () => {
    const storage = createMemoryStorage()
    rememberLoginIdentifier('maria@transportadora.com.br', storage)

    forgetLoginIdentifier(storage)

    expect(readRememberedLoginIdentifier(storage)).toBe('')
  })

  /** Aba privada ou armazenamento bloqueado: a conveniência some, o login não. */
  test('never breaks the login when the browser refuses storage', () => {
    expect(() => rememberLoginIdentifier('maria', UNAVAILABLE_STORAGE)).not.toThrow()
    expect(() => forgetLoginIdentifier(UNAVAILABLE_STORAGE)).not.toThrow()
    expect(readRememberedLoginIdentifier(UNAVAILABLE_STORAGE)).toBe('')
  })

  /**
   * CPF, telefone e e-mail são dado pessoal: vivem só na aba (`sessionStorage`), nunca no
   * `localStorage`, que sobrevive ao navegador fechado e fica para o próximo que usar a máquina.
   */
  test('keeps the identifier in the tab session only', () => {
    const source = readSource('modules/identity/shared/loginIdentifierMemory.service.ts')

    expect(source).toContain('window.sessionStorage')
    expect(source).not.toContain('localStorage')
  })

  test('the identifier screen starts with the remembered value and remembers what is sent', () => {
    const page = readSource('modules/identity/pages/LoginIdentifier.page.tsx')

    expect(page).toContain('useState(readRememberedLoginIdentifier)')
    expect(page).toContain('rememberLoginIdentifier(typed)')
  })

  test('the application forgets the identifier once the session exists', () => {
    const main = readSource('main.tsx')
    const authenticated = main.indexOf('const isAuthenticated = await initializeKeycloakAuth()')
    const forget = main.indexOf('forgetLoginIdentifier()', authenticated)
    const application = main.indexOf(
      'takeOverDriverEntry({ isAuthenticated: true })',
      authenticated,
    )

    expect(authenticated).toBeGreaterThan(-1)
    expect(forget).toBeGreaterThan(authenticated)
    expect(forget).toBeLessThan(application)
  })
})
