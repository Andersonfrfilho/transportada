/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF24 a RF27): a regra de **quando** avisar, **quem** avisar e **por qual canal**, pura (sem banco, sem
 * relógio, sem fuso: datas civis de São Paulo em texto e a hora já convertida). A rotina da T7.4 só a aplica; o leitor de
 * destinatários (`drizzle-expense-reminder-recipients.repository.ts`) usa `personalReminderChannels`.
 *
 * Decisões (aviso de dinheiro não pode sumir em silêncio, nem chegar a quem não pediu):
 * - **Quando**: `before` exatamente `daysBefore` dias antes (0 desliga), `due_today` no dia e `overdue` do 1º ao
 *   `maxOverdueNotices`-ésimo dia de atraso, contado pelo calendário (não pelo número de avisos já enviados: rotina
 *   que não rodou num dia não empurra o aviso para depois). Nada antes de `dailySummaryHour`.
 * - **Quem**: o responsável, se ele ainda é da empresa **e** tem algum canal ligado na empresa; senão os administradores
 *   (`company-admin` ativos). Responsável que não pode receber nada conta como sem responsável: o aviso cai no
 *   administrador em vez de não sair. **Tripulação pura nunca recebe** (`isBarredFromExpenseReminders`; papel de escritório prevalece): o leitor de
 *   destinatários o tira antes de chegar aqui, como responsável e como administrador.
 * - **Canal**: e-mail sempre que a pessoa tem e-mail; WhatsApp só com opt-in **e** número verificado; push só com opt-in.
 *   Cada um ainda precisa estar ligado na empresa. A ordem é fixa (e-mail, WhatsApp, push).
 *
 * A regra mora no SDK (`@adatechnology/expense-contracts`, módulo `reminder`). Aqui ficam só os papéis da transportada
 * (tripulação e neutro), que o pacote recebe como parâmetro: ele não conhece `driver`, `aggregate`, `helper` nem `viewer`.
 */
import {
  isBarredFromReminders,
  isReminderHour as sdkIsReminderHour,
  type ReminderSettings,
} from '@adatechnology/expense-contracts'

export {
  belongsToDailySummary,
  chooseReminderRecipients,
  civilDaysBetween,
  daysUntilDue,
  effectiveReminderChannels,
  personalReminderChannels,
  reminderKindOn,
} from '@adatechnology/expense-contracts'
export type {
  ReminderPersonFacts,
  ReminderRecipientChoice,
  ReminderRecipientReason,
} from '@adatechnology/expense-contracts'

/** Papéis da tripulação: motorista, agregado e ajudante. Conta é controle financeiro da empresa, e a tripulação não recebe. */
export const EXPENSE_REMINDER_DRIVING_ROLES = ['driver', 'aggregate', 'helper'] as const

/** Papéis que não mostram função de escritório: `viewer` todo mundo tem, então não tira a pessoa da tripulação. */
export const EXPENSE_REMINDER_NEUTRAL_ROLES = ['viewer'] as const

/**
 * RF24 (decisão do Anderson, 2026-11-15, revista em 2026-11-19): **a tripulação não recebe aviso de conta, a menos que também tenha
 * papel de escritório**. Tripulação = papel de motorista, agregado ou ajudante, direto ou por grupo, ou ficha da frota que dirige ou ajuda
 * (`fleet_drivers.can_drive` ou `can_act_as_helper`). Papel de escritório = qualquer outro além de `viewer`: ele prevalece sobre o de
 * motorista (a Andréia é agregada e motorista e também financeira, fiscal e operadora). Tripulação pura continua barrada: responsável
 * motorista conta como sem responsável e o aviso cai nos administradores.
 */
export function isBarredFromExpenseReminders(facts: {
  readonly drivesInFleet: boolean
  readonly roles: readonly string[]
}): boolean {
  return isBarredFromReminders({
    fieldRoles: EXPENSE_REMINDER_DRIVING_ROLES,
    isFieldStaff: facts.drivesInFleet,
    neutralRoles: EXPENSE_REMINDER_NEUTRAL_ROLES,
    roles: facts.roles,
  })
}

/** Avisos e resumo só saem a partir da hora configurada (São Paulo, hora cheia 0–23). */
export function isReminderHour(input: {
  readonly hourInSaoPaulo: number
  readonly settings: Pick<ReminderSettings, 'dailySummaryHour'>
}): boolean {
  return sdkIsReminderHour({ hourOfDay: input.hourInSaoPaulo, settings: input.settings })
}
