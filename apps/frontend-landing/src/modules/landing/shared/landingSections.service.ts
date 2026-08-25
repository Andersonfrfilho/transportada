/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O texto configurado (`landingSettings.sections`) sobrescreve o padrão do locale campo a campo —
 * uma seção parcialmente configurada não perde o resto. Valor de tipo errado (número onde se
 * espera texto) cai no padrão em vez de vazar para a tela.
 */
export function resolveSectionText(
  sections: Readonly<Record<string, unknown>>,
  sectionKey: string,
  field: string,
  fallback: string,
): string {
  const section = sections[sectionKey]
  if (typeof section !== 'object' || section === null) return fallback
  const value = (section as Record<string, unknown>)[field]
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function resolveSectionList(
  sections: Readonly<Record<string, unknown>>,
  sectionKey: string,
  field: string,
  fallback: readonly string[],
): readonly string[] {
  const section = sections[sectionKey]
  if (typeof section !== 'object' || section === null) return fallback
  const value = (section as Record<string, unknown>)[field]
  if (!Array.isArray(value)) return fallback
  const items = value.filter((entry): entry is string => typeof entry === 'string')
  return items.length > 0 ? items : fallback
}
