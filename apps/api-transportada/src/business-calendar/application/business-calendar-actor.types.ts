/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Quem escreve: a empresa e o usuário vêm do contexto autenticado, o IP do resolvedor injetado. */
export type BusinessCalendarActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}
