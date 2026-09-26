/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 193 D1 (ADR-0079 Parte A): quem recebeu, em relação ao destinatário — lista fechada, nesta
 * ordem (é a ordem do seletor).
 *
 * ⚠️ **Cópia por valor de `RECEIVED_BY_OPTIONS`** (`apps/api-transportada/src/database/trip.schema.ts`)
 * — o bundle não carrega código de lá. A paridade é vigiada em `catalog-parity.contract.ts`, que lê
 * o arquivo da API.
 */
export const RECEIVED_BY_OPTIONS = [
  'recipient',
  'spouse',
  'child',
  'parent',
  'sibling',
  'other_relative',
  'neighbor',
  'doorman',
  'employee',
  'other',
] as const
export type ReceivedBy = (typeof RECEIVED_BY_OPTIONS)[number]

/**
 * ⚠️ Cópia por valor de `RECEIVED_BY_OPTIONS_REQUIRING_DETAIL`. A falta do detalhe nestes dois não
 * bloqueia nada (C1) — só marca a pendência visível (R2).
 */
export const RECEIVED_BY_OPTIONS_REQUIRING_DETAIL = [
  'other_relative',
  'other',
] as const satisfies readonly ReceivedBy[]

/** ⚠️ Cópia por valor de `RECEIVED_BY_DETAIL_MAX_LENGTH` — o `maxLength` do campo "Detalhes". */
export const RECEIVED_BY_DETAIL_MAX_LENGTH = 120
