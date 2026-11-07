/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type PostponableStopReminder = {
  readonly status: string
  readonly postponements: number
}

export type ApplyStopReminderPostponementParams = {
  readonly companyId: string
  readonly reminderId: string
  /** Quantos adiamentos o lembrete tinha quando foi lido: a gravação só vale se ele ainda tem esse número. */
  readonly postponements: number
  readonly dueAt: Date
  readonly now: Date
}

/** Leitura e escrita do adiamento: toda consulta e todo `UPDATE` leva `companyId` (RNF5). */
export type DriverStopReminderPostponementRepository = {
  find(params: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<PostponableStopReminder | undefined>
  readIntervalMinutes(companyId: string): Promise<number>
  /** Devolve a tentativa, soma um adiamento e marca o próximo prazo; `false` quando o lembrete mudou no meio. */
  applyPostponement(params: ApplyStopReminderPostponementParams): Promise<boolean>
}
