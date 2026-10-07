/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo da prévia que nunca reconhece a mensagem — é o que prova que o trilho de
 * conversa da 143/183 segue idêntico quando o endereço não é o de uma prévia.
 */
import type { CargoPreviewEmailIntakePort } from '../../src/cargo-preview-email/application/cargo-preview-email.types.js'

export const NOT_A_PREVIEW_INTAKE: CargoPreviewEmailIntakePort = {
  hasIntake: async () => false,
  intake: async () => ({ kind: 'not_a_preview' }),
}
