/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0068 §5-6, spec 157 T6/T7: a porta que a T7 implementa (`DrizzleDriverScoreRepository`, uma
 * consulta por empresa e lista de motoristas, sem N+1). Definida aqui já na T6 para o snapshot do
 * motorista (`find-current-driver-trip.use-case.ts`) e as rotas da frota (T8) dependerem da forma,
 * não da implementação — `score` continua fora do snapshot até a T7 ligar um repositório real.
 */
import type { DriverPenalty } from '../domain/driver-score.policy.js'

export type DriverScorePort = {
  /** Nota por motorista — `null` quando o motorista não teve entrega com foto obrigatória em 90 dias. */
  readScores(input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly now: Date
  }): Promise<ReadonlyMap<string, number | null>>
  /** As penalidades vigentes de um motorista (ficha, T8) — id do documento, NF-e, motivo, pontos, prazo. */
  readPenalties(input: {
    readonly companyId: string
    readonly driverId: string
    readonly now: Date
  }): Promise<readonly DriverPenalty[]>
}
