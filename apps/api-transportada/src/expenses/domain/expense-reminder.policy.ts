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
 *   administrador em vez de não sair.
 * - **Canal**: e-mail sempre que a pessoa tem e-mail; WhatsApp só com opt-in **e** número verificado; push só com opt-in.
 *   Cada um ainda precisa estar ligado na empresa. A ordem é fixa (e-mail, WhatsApp, push).
 */
import type {
  ReminderChannel,
  ReminderKind,
  ReminderRecipient,
  ReminderSettings,
} from '../application/expense-reminder.port.js'

const DAY_MS = 86_400_000
const CIVIL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/u
const CHANNEL_ORDER: readonly ReminderChannel[] = ['email', 'whatsapp', 'push']

function civilDayNumber(value: string): number {
  const match = CIVIL_DATE_REGEX.exec(value)
  if (match === null) throw new Error(`data civil inválida: ${value}`)
  const [, year, month, day] = match
  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS
}

/** Dias de `from` até `to` (positivo quando `to` é depois). Datas `yyyy-mm-dd`. */
export function civilDaysBetween(from: string, to: string): number {
  return civilDayNumber(to) - civilDayNumber(from)
}

/** RF25: o tipo de aviso que a ocorrência `open` pede hoje, ou `null`. Não olha status: isso é do caso de uso. */
export function reminderKindOn(input: {
  readonly dueDate: string
  readonly settings: Pick<ReminderSettings, 'daysBefore' | 'maxOverdueNotices'>
  readonly today: string
}): ReminderKind | null {
  const daysUntilDue = civilDaysBetween(input.today, input.dueDate)
  if (daysUntilDue === 0) return 'due_today'
  if (daysUntilDue > 0) {
    return input.settings.daysBefore > 0 && daysUntilDue === input.settings.daysBefore
      ? 'before'
      : null
  }
  return -daysUntilDue <= input.settings.maxOverdueNotices ? 'overdue' : null
}

/** Quantos dias faltam (positivo) ou de atraso (negativo): é o que o texto do aviso diz. */
export function daysUntilDue(input: { readonly dueDate: string; readonly today: string }): number {
  return civilDaysBetween(input.today, input.dueDate)
}

/** RF27: o resumo do dia lista o que vence hoje e tudo o que está vencido e aberto, sem limite de dias. */
export function belongsToDailySummary(input: {
  readonly dueDate: string
  readonly status: string
  readonly today: string
}): boolean {
  return input.status === 'open' && civilDaysBetween(input.today, input.dueDate) <= 0
}

/** Avisos e resumo só saem a partir da hora configurada (São Paulo, hora cheia 0–23). */
export function isReminderHour(input: {
  readonly hourInSaoPaulo: number
  readonly settings: Pick<ReminderSettings, 'dailySummaryHour'>
}): boolean {
  return input.hourInSaoPaulo >= input.settings.dailySummaryHour
}

/** O que a pessoa tem para receber, antes de olhar a empresa. Lido do perfil, da preferência e do número verificado. */
export type ReminderPersonFacts = {
  readonly hasEmail: boolean
  readonly hasVerifiedWhatsapp: boolean
  readonly pushOptIn: boolean
  readonly whatsappOptIn: boolean
}

/** RF26: os canais da pessoa (sem a empresa). E-mail não tem opt-out: é o canal que garante o aviso. */
export function personalReminderChannels(facts: ReminderPersonFacts): readonly ReminderChannel[] {
  return CHANNEL_ORDER.filter((channel) => {
    if (channel === 'email') return facts.hasEmail
    if (channel === 'whatsapp') return facts.whatsappOptIn && facts.hasVerifiedWhatsapp
    return facts.pushOptIn
  })
}

/** RF26: os canais em que o aviso de fato sai para a pessoa: os dela, ligados na empresa. */
export function effectiveReminderChannels(input: {
  readonly companyChannels: readonly ReminderChannel[]
  readonly recipient: Pick<ReminderRecipient, 'channels'>
}): readonly ReminderChannel[] {
  return CHANNEL_ORDER.filter(
    (channel) =>
      input.recipient.channels.includes(channel) && input.companyChannels.includes(channel),
  )
}

export type ReminderRecipientReason =
  /** O responsável da conta recebe. */
  | 'responsible'
  /** Conta sem responsável, ou responsável que saiu da empresa: vai aos administradores (RF24). */
  | 'no_responsible'
  /** O responsável existe, mas não tem nenhum canal ligado na empresa: vai aos administradores. */
  | 'responsible_unreachable'

export type ReminderRecipientChoice = {
  readonly reason: ReminderRecipientReason
  /** Já com os canais efetivos; vazio só quando nem administrador pode receber (a T7.4 conta como falha). */
  readonly recipients: readonly ReminderRecipient[]
}

/** RF24: quem recebe o aviso de uma ocorrência. `responsible` é `null` quando a conta não tem ou ele não é mais da empresa. */
export function chooseReminderRecipients(input: {
  readonly admins: readonly ReminderRecipient[]
  readonly companyChannels: readonly ReminderChannel[]
  readonly responsible: ReminderRecipient | null
}): ReminderRecipientChoice {
  const reachable = (recipient: ReminderRecipient): ReminderRecipient | null => {
    const channels = effectiveReminderChannels({
      companyChannels: input.companyChannels,
      recipient,
    })
    return channels.length === 0 ? null : { channels, userId: recipient.userId }
  }

  if (input.responsible !== null) {
    const responsible = reachable(input.responsible)
    if (responsible !== null) return { reason: 'responsible', recipients: [responsible] }
  }

  const seen = new Set<string>()
  const admins = input.admins
    .map(reachable)
    .filter((recipient): recipient is ReminderRecipient => recipient !== null)
    .filter((recipient) =>
      seen.has(recipient.userId) ? false : (seen.add(recipient.userId), true),
    )
  return {
    reason: input.responsible === null ? 'no_responsible' : 'responsible_unreachable',
    recipients: admins,
  }
}
