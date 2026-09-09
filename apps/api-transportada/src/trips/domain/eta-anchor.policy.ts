/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 109 D2: **o roteiro é planejado para uma hora de saída, e o caminhão sai noutra.**
 *
 * A premissa do planejamento é `company_route_optimization_settings.departure_time_seconds` (08:00);
 * a saída real é o clique do motorista no app. Sem reancorar, uma saída às 09:30 deixa toda a viagem
 * anunciando horas de 08:00 — plausíveis, e erradas por uma hora e meia, que é justamente o tipo de
 * número que este produto recusa (ADR-0044 §1).
 *
 * ⚠️ **Deslocar, não recalcular.** A ordem das paradas foi conferida no galpão e o motorista carregou
 * o caminhão nela; reordenar na saída entregaria a ele um roteiro diferente do que foi carregado. O
 * deslocamento preserva o ritmo aprovado e diz a verdade sobre o relógio.
 */
export function resolveEtaShiftMilliseconds(input: {
  /** A saída a que os ETAs de hoje estão ancorados; `null` é viagem sem ETA nenhum. */
  readonly anchoredDepartureAt: Date | null
  readonly departedAt: Date
}): number {
  /**
   * ⚠️ Sem âncora **não se desloca**: viagem planejada antes desta spec, ou montada à mão, não tem
   * hora de saída suposta — e deslocar por uma âncora inventada erraria mais que não deslocar.
   */
  if (input.anchoredDepartureAt === null) return 0

  return input.departedAt.getTime() - input.anchoredDepartureAt.getTime()
}
