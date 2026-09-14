/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 109 D2/D3: **o roteiro é planejado para um relógio, e o dia acontece noutro.**
 *
 * A mesma conta serve aos dois momentos em que o campo contradiz o plano, e é de propósito que ela
 * seja uma só — duas definições de "atraso" divergiriam no primeiro caso de borda:
 *
 * - **na saída**: o previsto é a hora de partida suposta, o real é o clique do motorista;
 * - **em cada chegada**: o previsto é o ETA daquela parada, o real é o "cheguei".
 *
 * Sem reancorar, uma saída às 09:30 deixa a viagem inteira anunciando horas de 08:00, e uma entrega
 * que demorou quarenta minutos a mais deixa o resto do dia adiantado — números plausíveis e errados,
 * que é o que este produto recusa (ADR-0044 §1).
 *
 * ⚠️ **Deslocar, não recalcular.** A ordem foi conferida no galpão e o caminhão foi carregado nela;
 * reordenar no meio do dia entregaria ao motorista um roteiro diferente do que está no baú.
 */
export function resolveEtaShiftMilliseconds(input: {
  /** O que o plano dizia: a partida suposta, ou o ETA da parada. `null` é ausência de plano. */
  readonly plannedAt: Date | null
  /** O que aconteceu: a saída, ou a chegada. */
  readonly reportedAt: Date
}): number {
  /**
   * ⚠️ Sem previsão **não se desloca**: viagem planejada antes desta spec, parada sem ETA, roteiro
   * montado à mão. Deslocar por uma âncora inventada erraria mais que não deslocar.
   */
  if (input.plannedAt === null) return 0

  return input.reportedAt.getTime() - input.plannedAt.getTime()
}
