/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T903 (F5): as guardas da leitura das respostas da conversa. Cada módulo tem as próprias
 * (`fleetGuards`, `nfseInvoiceGuards`…); ler as de `trip` fechava um ciclo, porque `trip` importa a
 * conversa.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}
