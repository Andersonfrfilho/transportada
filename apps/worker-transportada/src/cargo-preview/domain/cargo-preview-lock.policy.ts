/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `buildCargoPreviewMatchLockKey` da API
 * (`cargo-receiving/domain/cargo-preview-upload.policy.ts`): worker e operador tomam a MESMA trava
 * advisory antes de ler as notas livres. Chave diferente = duas travas = nota em dois grupos. O
 * contrato de paridade cobra o corpo.
 */
import { CARGO_PREVIEW_MATCH_LOCK_PREFIX } from '../../shared/cargo-preview.constant.js'

export function buildCargoPreviewMatchLockKey(input: {
  readonly companyId: string
  readonly contractorId: string
}): string {
  return `${CARGO_PREVIEW_MATCH_LOCK_PREFIX}:${input.companyId}:${input.contractorId}`
}
