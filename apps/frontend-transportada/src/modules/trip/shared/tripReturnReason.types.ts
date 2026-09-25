/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Cópia por valor de `driver-return-reason.policy.ts`; a paridade com a API é assertada por
 * contrato (`catalog-parity`). Mora no módulo `trip` porque é o escritório quem a usa na baixa em
 * nome do motorista (ADR-0067), e ela fica quando o módulo antigo do motorista sair (ADR-0075 §6).
 */
export const DRIVER_RETURN_REASONS = [
  'recipient_absent',
  'recipient_refused',
  'address_not_found',
  'damaged_goods',
  'establishment_closed',
] as const
export type DriverReturnReason = (typeof DRIVER_RETURN_REASONS)[number]
