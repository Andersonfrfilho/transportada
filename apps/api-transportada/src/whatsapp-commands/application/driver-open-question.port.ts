/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverOpenQuestions } from '../domain/driver-open-question.policy.js'

/** A leitura completa, sem contexto de turno, para quem pergunta de fora de qualquer fluxo (o lembrete da parada). */
export type DriverOpenQuestionPort = {
  read(input: {
    readonly companyId: string
    readonly driverId: string
    readonly now: Date
  }): Promise<DriverOpenQuestions>
}
