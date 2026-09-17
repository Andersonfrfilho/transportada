/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 153 D6: reordenar paradas recalcula a rota congelada com `cheapest`, sempre — o congelador
 * não carrega a escolha do operador nessa chamada (`reorder-trip-stops.use-case.ts`). Por isso o
 * replanejamento com a escolha do operador tem de ser o último passo: na ordem contrária, a
 * reordenação sobrescreveria em silêncio a rota que o operador escolheu por uma mais barata.
 */
export async function finalizeQuickCreateRoute(
  input: Readonly<{
    planRoute: () => Promise<void>
    reorderStops: () => Promise<void>
    shouldReorder: boolean
  }>,
): Promise<void> {
  if (input.shouldReorder) {
    await input.reorderStops()
  }
  await input.planRoute()
}
