/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Erro cuja mensagem **pode** ir para o log do servidor.
 *
 * A politica geral e a oposta, e ela e deliberada: mensagem de erro arbitrario pode carregar
 * segredo ou dado pessoal -- senha de PFX, corpo de nota, `Failing row contains (...)` do driver.
 * `test/digital-certificates-http/idempotency-and-errors.contract.ts` monta um erro com essas
 * palavras e exige que nenhuma alcance o log. Por isso a permissao e **nominal**: quem herda daqui
 * esta afirmando que a mensagem e escrita pelo nosso codigo e nao interpola dado.
 *
 * ⚠️ Interpolar valor de entrada na mensagem de um `DiagnosableError` anula a garantia. Se a causa
 * precisa de contexto, ele vai em campo tipado, nunca no texto.
 */
export abstract class DiagnosableError extends Error {
  public readonly diagnosable = true as const
}

export function isDiagnosableError(error: unknown): error is DiagnosableError {
  return error instanceof DiagnosableError
}
