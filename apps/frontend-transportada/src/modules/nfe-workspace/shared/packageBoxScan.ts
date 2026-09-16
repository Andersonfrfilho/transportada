/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Decisão extraída para função pura (T14, 4ª revisão): o contrato anterior varria o texto-fonte
 * do hook e passava sem exercitar o comportamento — esta app não tem renderer de hooks (sem
 * `@testing-library/react`), então a decisão que importa vira função pura testável sem ele. Bipar a
 * MESMA etiqueta depois de uma falha de consulta precisa refazer a consulta (`retryLookup`) em vez
 * de trocar o estado: repetir o valor não muda a `queryKey`, e sem isso o TanStack Query nunca
 * dispara de novo (3ª revisão, item M1).
 *
 * ⚠️ BAIXO-5 (T14, 5ª revisão): movida de `usePackageBoxQueue.hook.ts` para módulo próprio — era a
 * única função pura morando dentro de um hook. O hook reexporta, para não quebrar quem já importa
 * `isRepeatedScan` a partir dele.
 */
export function isRepeatedScan(input: {
  readonly current: null | string
  readonly next: null | string
}): boolean {
  return input.next !== null && input.next === input.current
}
