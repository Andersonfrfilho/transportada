/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { findUnsafeEmailHtml } from '@adatechnology/notification-contracts'

import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { EXPENSE_REMINDER_TEMPLATE_KEY } from '../domain/company-expense-reminder.constant.js'
import {
  buildExpenseMailButtonHtml,
  buildExpenseReminderValues,
  renderExpenseReminderMail,
} from '../domain/expense-reminder-mail.policy.js'
import {
  chooseReminderRecipients,
  isReminderHour,
  reminderKindOn,
} from '../domain/expense-reminder.policy.js'
import type {
  CompanyExpenseReminderPorts,
  ReminderKind,
  ReminderOccurrence,
  ReminderPerson,
} from './company-expense-reminder.port.js'

export type CompanyExpenseReminderRoutineDependencies = {
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly ports: CompanyExpenseReminderPorts
}

type Counters = {
  failed: number
  sent: number
  skipped: number
  templateMissing: number
  unsupportedChannel: number
}

const SAO_PAULO_DATE = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
})
const SAO_PAULO_HOUR = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Sao_Paulo',
})

/** Dia civil (`yyyy-mm-dd`) e hora cheia em São Paulo; a regra pura só recebe os dois já convertidos. */
export function saoPauloClock(now: Date): { readonly hour: number; readonly today: string } {
  return { hour: Number(SAO_PAULO_HOUR.format(now)), today: SAO_PAULO_DATE.format(now) }
}

/**
 * Spec 325 T7.4 (RF25, RF28): avisa por e-mail as contas a vencer, as que vencem hoje e as vencidas, por empresa.
 * Idempotente: o aviso é reservado em `company_expense_reminders_sent` antes de enviar (chave única por ocorrência,
 * responsável, dia e tipo) e a reserva é solta se o e-mail não saiu. WhatsApp e push ainda não saem daqui (contados em
 * `unsupportedChannel`). Uma empresa que falha não segura as outras; o ciclo as termina e só depois acusa.
 */
export function createCompanyExpenseReminderRoutine(
  dependencies: CompanyExpenseReminderRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

async function runCycle(input: {
  readonly context: JobRoutineContext
  readonly dependencies: CompanyExpenseReminderRoutineDependencies
}): Promise<JobRoutineResult> {
  const { context, dependencies } = input
  const { hour, today } = saoPauloClock(dependencies.now())
  const counters: Counters = {
    failed: 0,
    sent: 0,
    skipped: 0,
    templateMissing: 0,
    unsupportedChannel: 0,
  }
  let failedCompanies = 0
  let processedCompanies = 0

  for (const companyId of await dependencies.ports.companies.listWithOpenOccurrences()) {
    if (context.isStopRequested()) break
    try {
      await remindCompany({ companyId, counters, dependencies, hour, today })
      processedCompanies += 1
    } catch (error: unknown) {
      failedCompanies += 1
      safeLogWarn({
        logger: dependencies.logger,
        message: 'company_expense_reminder_company_failed',
        metadata: {
          companyId,
          correlationId: context.correlationId,
          error: error instanceof Error ? error.message : 'unknown',
          executionId: context.executionId,
        },
      })
    }
  }

  safeLogInfo({
    logger: dependencies.logger,
    message: 'company_expense_reminder_cycle_finished',
    metadata: {
      ...counters,
      correlationId: context.correlationId,
      executionId: context.executionId,
      failedCompanies,
      processedCompanies,
      today,
    },
  })

  if (failedCompanies > 0) {
    throw new Error(`company expense reminders failed for ${failedCompanies} company(ies)`)
  }
  return { counters: { ...counters, companies: processedCompanies }, outcome: 'succeeded' }
}

async function remindCompany(input: {
  readonly companyId: string
  readonly counters: Counters
  readonly dependencies: CompanyExpenseReminderRoutineDependencies
  readonly hour: number
  readonly today: string
}): Promise<void> {
  const { companyId, counters, dependencies, hour, today } = input
  const { ports } = dependencies
  const settings = await ports.settings.get({ companyId })
  // Nada antes da hora da empresa: aviso de dinheiro de madrugada não é lido.
  if (!isReminderHour({ hourInSaoPaulo: hour, settings })) return

  const due: { kind: ReminderKind; occurrence: ReminderOccurrence }[] = []
  for (const occurrence of await ports.occurrences.listOpen({ companyId })) {
    const kind = reminderKindOn({ dueDate: occurrence.dueDate, settings, today })
    if (kind !== null) due.push({ kind, occurrence })
  }
  if (due.length === 0) return

  const template = await ports.templates.findEmail({
    companyId,
    key: EXPENSE_REMINDER_TEMPLATE_KEY,
  })
  if (template === null || findUnsafeEmailHtml(template.body).length > 0) {
    counters.templateMissing += due.length
    return
  }
  const companyDisplayName = await ports.companies.displayName({ companyId })
  const admins = await ports.people.findAdmins({ companyId })
  const openContasUrl =
    ports.appBaseUrl === null ? null : `${ports.appBaseUrl.replace(/\/$/u, '')}/contas`

  for (const { kind, occurrence } of due) {
    const responsible =
      occurrence.responsibleUserId === null
        ? null
        : await ports.people.findById({ companyId, userId: occurrence.responsibleUserId })
    const people = new Map<string, ReminderPerson>(
      [...admins, ...(responsible === null ? [] : [responsible])].map((p) => [p.userId, p]),
    )
    const settingsChannels = settings.enabledChannels
    const choice = chooseReminderRecipients({
      admins,
      companyChannels: settingsChannels,
      responsible,
    })
    if (choice.recipients.length === 0) {
      counters.failed += 1
      continue
    }
    for (const recipient of choice.recipients) {
      const person = people.get(recipient.userId)
      counters.unsupportedChannel += recipient.channels.filter((c) => c !== 'email').length
      if (person === undefined || !recipient.channels.includes('email')) continue
      await sendEmailReminder({
        companyDisplayName,
        companyId,
        counters,
        dependencies,
        kind,
        occurrence,
        openContasUrl,
        person,
        template,
        today,
      })
    }
  }
}

async function sendEmailReminder(input: {
  readonly companyDisplayName: string
  readonly companyId: string
  readonly counters: Counters
  readonly dependencies: CompanyExpenseReminderRoutineDependencies
  readonly kind: ReminderKind
  readonly occurrence: ReminderOccurrence
  readonly openContasUrl: string | null
  readonly person: ReminderPerson
  readonly template: { readonly body: string; readonly subject: string }
  readonly today: string
}): Promise<void> {
  const { counters, occurrence, person } = input
  const { ports } = input.dependencies
  if (person.emailAddress === null) {
    counters.failed += 1
    return
  }
  const key = {
    companyId: input.companyId,
    day: input.today,
    kind: input.kind,
    occurrenceId: occurrence.id,
    recipientUserId: person.userId,
  }
  // Reserva antes de enviar: duas rotinas ao mesmo tempo não mandam duas vezes (a chave única decide).
  if (!(await ports.sent.record({ ...key, channel: 'email' }))) {
    counters.skipped += 1
    return
  }
  try {
    const mail = renderExpenseReminderMail({
      systemHtml: {
        botaoAbrirContas: buildExpenseMailButtonHtml({
          label: 'Abrir Contas',
          primary: false,
          url: input.openContasUrl,
        }),
        // O "Já paguei" vem com a baixa por resposta (T7.4b); até lá o botão não aparece.
        botaoJaPaguei: '',
      },
      template: input.template,
      values: buildExpenseReminderValues({
        amount: occurrence.expectedAmount,
        categoryName: occurrence.categoryName,
        companyDisplayName: input.companyDisplayName,
        competence: occurrence.competence,
        dueDate: occurrence.dueDate,
        expenseName: occurrence.expenseName,
        payeeName: occurrence.payeeName,
        recipientName: person.name,
        today: input.today,
      }),
    })
    await ports.mailer.send({
      ...mail,
      idempotencyKey: `expense-reminder:${occurrence.id}:${person.userId}:${input.today}:${input.kind}`,
      to: person.emailAddress,
    })
    counters.sent += 1
  } catch {
    counters.failed += 1
    // Nenhum canal entregou: solta a reserva, a próxima rodada do dia tenta de novo.
    await ports.sent.release(key)
  }
}
