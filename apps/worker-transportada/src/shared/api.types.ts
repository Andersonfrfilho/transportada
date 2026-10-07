/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o pedaço de `api-transportada/src/shared/api.types.ts` que o domínio da prévia,
 * copiado por valor para cá, importa. Contrato de paridade em `test/cargo-receiving/`.
 */
export type ApiErrorDetail = {
  readonly field: string
  readonly message: string
}
