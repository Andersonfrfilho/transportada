/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

/** Cópia por valor do catálogo fechado da API (ADR-0075 §7); um contrato confere as duas listas. */
export const OCCURRENCE_TYPE_ICON_NAMES = [
  'alert',
  'camera',
  'clipboard-list',
  'clock',
  'document',
  'invoice',
  'message',
  'money',
  'package',
  'truck',
] as const satisfies readonly IconName[]

export type OccurrenceTypeIconName = (typeof OCCURRENCE_TYPE_ICON_NAMES)[number]

export function isOccurrenceTypeIconName(value: unknown): value is OccurrenceTypeIconName {
  return OCCURRENCE_TYPE_ICON_NAMES.some((name) => name === value)
}
