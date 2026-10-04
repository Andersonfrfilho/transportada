/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `buildCargoPreviewObjectKey` e do teto `CARGO_PREVIEW_UPLOAD_MAX_BYTES` da API
 * (`cargo-receiving/domain/cargo-preview-upload.policy.ts`). Revisão de segurança S7: o worker lê o
 * objeto pela LINHA da prévia, nunca pela chave que a mensagem traz. O contrato de paridade cobra.
 */
export function buildCargoPreviewObjectKey(input: {
  readonly companyId: string
  readonly fileObjectId: string
}): string {
  return `tenants/${input.companyId}/cargo-previews/${input.fileObjectId}`
}

/** O corpo da API para em 1 MiB, e 64 KiB são do envelope multipart: o arquivo tem até 960 KiB. */
export const CARGO_PREVIEW_OBJECT_MAX_BYTES = 960 * 1024
