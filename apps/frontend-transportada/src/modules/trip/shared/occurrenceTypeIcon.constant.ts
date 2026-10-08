/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { IconName } from '@/components/ui/icon'

/** Espelha o catálogo fechado da API; o contrato lê o arquivo de lá e exige igualdade. */
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
