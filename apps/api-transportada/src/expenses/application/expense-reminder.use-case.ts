/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.1: esqueleto vermelho. A T7.4 implementa a rotina; a T7.4b, a baixa por resposta e o desfazer.
 */
import { chooseReminderRecipients, reminderKindOn } from '../domain/expense-reminder.policy.js'
import type {
  ReminderKind,
  ReminderPorts,
  ReminderRecipient,
  SentReminderKey,
  ReplySettlementPorts,
  RunRemindersResult,
  SettleByReplyResult,
  ReplySender,
} from './expense-reminder.port.js'

export function createRunExpenseRemindersUseCase(ports: ReminderPorts): {
  /** `today` é `yyyy-mm-dd` em São Paulo. Idempotente no dia (CA14). */
  execute(input: { companyId: string; today: string }): Promise<RunRemindersResult>
} {
  return {
    async execute({ companyId, today }) {
      const settings = await ports.settings.get({ companyId })
      const occurrences = await ports.occurrences.listForReminders({ companyId })
      let admins: readonly ReminderRecipient[] | null = null
      const counters = { failed: 0, sent: 0, skipped: 0 }

      for (const occurrence of occurrences) {
        // Defesa em profundidade: a porta já filtra por empresa, mas o isolamento não depende dela.
        if (occurrence.companyId !== companyId || occurrence.status !== 'open') continue
        const kind = reminderKindOn({ dueDate: occurrence.dueDate, settings, today })
        if (kind === null) continue

        try {
          admins ??= await ports.recipients.findAdmins({ companyId })
          const responsible =
            occurrence.responsibleUserId === null
              ? null
              : await ports.recipients.findById({
                  companyId,
                  userId: occurrence.responsibleUserId,
                })
          const choice = chooseReminderRecipients({
            admins,
            companyChannels: settings.enabledChannels,
            responsible,
          })
          if (choice.recipients.length === 0) {
            counters.failed += 1
            continue
          }
          for (const recipient of choice.recipients) {
            await remindOne({
              counters,
              kind,
              occurrenceId: occurrence.id,
              ports,
              recipient,
              companyId,
              today,
            })
          }
        } catch {
          counters.failed += 1
        }
      }
      return counters
    },
  }
}

async function remindOne(input: {
  readonly companyId: string
  readonly counters: { failed: number; sent: number; skipped: number }
  readonly kind: ReminderKind
  readonly occurrenceId: string
  readonly ports: ReminderPorts
  readonly recipient: ReminderRecipient
  readonly today: string
}): Promise<void> {
  const { counters, ports, recipient } = input
  const key: SentReminderKey = {
    companyId: input.companyId,
    day: input.today,
    kind: input.kind,
    occurrenceId: input.occurrenceId,
    recipientUserId: recipient.userId,
  }
  // Reserva antes de enviar: duas rotinas ao mesmo tempo não mandam duas vezes (a chave única decide).
  const firstChannel = recipient.channels[0]
  if (firstChannel === undefined || !(await ports.sent.record({ ...key, channel: firstChannel }))) {
    counters.skipped += 1
    return
  }
  let delivered = 0
  for (const channel of recipient.channels) {
    try {
      await ports.notifier.send({ ...key, channel })
      delivered += 1
      counters.sent += 1
    } catch {
      counters.failed += 1
    }
  }
  // Nenhum canal entregou: solta a reserva, a próxima rodada do dia tenta de novo.
  if (delivered === 0) await ports.sent.release(key)
}

export function createSettleExpenseByReplyUseCase(ports: ReplySettlementPorts): {
  execute(input: {
    companyId: string
    occurrenceId?: string
    sender: ReplySender
    today: string
  }): Promise<SettleByReplyResult>
} {
  return {
    execute() {
      void ports
      return Promise.reject(new Error('not implemented'))
    },
  }
}

export function createUndoReplySettlementUseCase(ports: ReplySettlementPorts): {
  /** RF31: só o administrador, em até 24 h, com motivo; erros `ExpenseReplyUndo*` fora disso. */
  execute(input: {
    actorUserId: string
    actorIsAdmin: boolean
    companyId: string
    nowIso: string
    occurrenceId: string
    reason: string
  }): Promise<void>
} {
  return {
    execute() {
      void ports
      return Promise.reject(new Error('not implemented'))
    },
  }
}
