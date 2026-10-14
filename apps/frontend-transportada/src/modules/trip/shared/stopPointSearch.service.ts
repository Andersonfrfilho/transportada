/* Copyright (c) 2026 Ada Technology. MIT License. */
import { searchAddress, type AddressSuggestion } from '../../fleet/shared/driverAddress.service'

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
}

/**
 * A primeira sugestão com coordenada **na cidade da parada** — o rótulo da parada traz a cidade, e
 * um resultado de outro município é descartado em vez de virar ponto errado (caso Rua Antonio
 * Petri, que ficou com a coordenada de outra rua).
 */
export function pickStopPointSuggestion(
  input: Readonly<{ label: string; suggestions: readonly AddressSuggestion[] }>,
): AddressSuggestion | null {
  const label = fold(input.label)
  return (
    input.suggestions.find(
      (suggestion) =>
        suggestion.latitude !== null &&
        suggestion.longitude !== null &&
        suggestion.city !== '' &&
        label.includes(fold(suggestion.city)),
    ) ?? null
  )
}

/** Busca gratuita (Photon, ADR-0044): devolve o ponto para a pessoa conferir — nunca grava sozinha. */
export async function searchStopPoint(
  input: Readonly<{ fetch: typeof globalThis.fetch; label: string; signal: AbortSignal }>,
): Promise<AddressSuggestion | null> {
  const suggestions = await searchAddress({
    fetch: input.fetch,
    signal: input.signal,
    term: input.label,
  })
  return pickStopPointSuggestion({ label: input.label, suggestions })
}
