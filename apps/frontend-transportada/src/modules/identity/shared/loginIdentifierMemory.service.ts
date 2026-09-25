/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O que a pessoa digitou na identificação, para o "Trocar de usuário" da tela de senha devolver o
 * campo preenchido. É dado pessoal (CPF, telefone, e-mail): fica só na aba e sai quando a sessão
 * nasce — nunca no armazenamento que sobrevive ao navegador fechado e sobraria para o próximo que
 * usar a máquina.
 */
const LOGIN_IDENTIFIER_STORAGE_KEY = 'transportada.login-identifier.v1'

export type LoginIdentifierStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

function resolveStorage(): LoginIdentifierStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readRememberedLoginIdentifier(
  storage: LoginIdentifierStorage | null = resolveStorage(),
): string {
  try {
    return storage?.getItem(LOGIN_IDENTIFIER_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberLoginIdentifier(
  identifier: string,
  storage: LoginIdentifierStorage | null = resolveStorage(),
): void {
  try {
    storage?.setItem(LOGIN_IDENTIFIER_STORAGE_KEY, identifier.trim())
  } catch {
    // Aba privada ou armazenamento bloqueado: o campo só não volta preenchido.
  }
}

export function forgetLoginIdentifier(
  storage: LoginIdentifierStorage | null = resolveStorage(),
): void {
  try {
    storage?.removeItem(LOGIN_IDENTIFIER_STORAGE_KEY)
  } catch {
    // Sem armazenamento, não havia o que esquecer.
  }
}
