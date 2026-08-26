/* Copyright (c) 2026 Ada Technology. MIT License. */

const SESSION_STORAGE_KEY = 'aggregate-portal-access-token'

/**
 * Só o access token de curta duração fica aqui — o refresh token vive num cookie `HttpOnly` que o
 * próprio `user-module` já seta, nunca acessível a JavaScript. `sessionStorage`, não
 * `localStorage`: sobrevive a um F5, não sobrevive fechar a aba — o refresh cookie é quem decide
 * se a sessão continua depois disso.
 */
export function getStoredAccessToken(): string | undefined {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

export function storeAccessToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, token)
  } catch {
    // Sem storage disponível (modo privado, etc.) a sessão só dura o carregamento atual da página.
  }
}

export function clearStoredAccessToken(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Nada a limpar se nunca deu pra gravar.
  }
}
