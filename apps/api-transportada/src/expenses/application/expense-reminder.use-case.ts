/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.1: esqueleto vermelho. A T7.4 implementa a rotina; a T7.4b, a baixa por resposta e o desfazer.
 */
import type {
  ReminderPorts,
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
    execute() {
      void ports
      return Promise.reject(new Error('not implemented'))
    },
  }
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
