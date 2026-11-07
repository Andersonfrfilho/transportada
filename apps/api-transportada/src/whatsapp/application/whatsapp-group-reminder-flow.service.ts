/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 (RF11, RF13, RF14): o passo `reminder.stage` do grupo. Este arquivo lê o pedido do lembrete (o estado
 * que o abridor gravou), escolhe a ação da opção numerada e responde ao adiamento e à opção inválida. Quem executa
 * "cheguei", "entreguei", "não entreguei" e ocorrência é o roteador do grupo, pelos mesmos fluxos desses comandos.
 */
import {
  DRIVER_STOP_REMINDER_CHOICE_ACTION,
  DRIVER_STOP_REMINDER_IDLE_VARIANT,
  DRIVER_STOP_REMINDER_POSTPONE_OUTCOME,
} from '../../driver-stop-reminders/domain/driver-stop-reminder.constant.js'
import type { DriverStopReminderIdleVariant } from '../../driver-stop-reminders/domain/driver-stop-reminder.types.js'
import { resolveStopReminderChoice } from '../../driver-stop-reminders/domain/stop-reminder-message.policy.js'
import type { PostponeDriverStopReminderResult } from '../../driver-stop-reminders/application/postpone-driver-stop-reminder.use-case.js'
import {
  DRIVER_STOP_REMINDER_STAGES,
  type DriverStopReminderStage,
} from '../../shared/driver-stop-reminder.constant.js'
import type { WhatsAppBotSpeechPort } from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type { BotSpeechKey } from '../../whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { spokenOptionNumber } from '../../whatsapp-commands/domain/whatsapp-driver-journey.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'

export const GROUP_REMINDER_STEP = { stage: 'stage' } as const

export type GroupReminderTarget = {
  readonly reminderId: string
  readonly stage: DriverStopReminderStage
  readonly tripStopId: string
  readonly idleVariant?: DriverStopReminderIdleVariant
}

export type GroupReminderFlowPorts = {
  /** A primeira nota ainda aberta da parada; `undefined` quando não há nota aberta. */
  readNoteNumber(input: {
    readonly companyId: string
    readonly tripStopId: string
  }): Promise<string | undefined>
  postpone(input: {
    readonly companyId: string
    readonly reminderId: string
  }): Promise<PostponeDriverStopReminderResult>
  readonly speech: WhatsAppBotSpeechPort
}

const POSTPONE_SPEECH_KEY: Readonly<
  Record<PostponeDriverStopReminderResult['outcome'], BotSpeechKey>
> = {
  [DRIVER_STOP_REMINDER_POSTPONE_OUTCOME.CLOSED]: 'lembreteEncerrado',
  [DRIVER_STOP_REMINDER_POSTPONE_OUTCOME.NO_ANSWER]: 'lembreteAdiamentoEsgotado',
  [DRIVER_STOP_REMINDER_POSTPONE_OUTCOME.POSTPONED]: 'lembreteAdiado',
}

export type GroupReminderAction =
  (typeof DRIVER_STOP_REMINDER_CHOICE_ACTION)[keyof typeof DRIVER_STOP_REMINDER_CHOICE_ACTION]

function isIdleVariant(value: unknown): value is DriverStopReminderIdleVariant {
  return Object.values(DRIVER_STOP_REMINDER_IDLE_VARIANT).some((variant) => variant === value)
}

function isStage(value: unknown): value is DriverStopReminderStage {
  return DRIVER_STOP_REMINDER_STAGES.some((stage) => stage === value)
}

export function createGroupReminderFlow(ports: GroupReminderFlowPorts) {
  return {
    /** O lembrete que o pedido cobra; `undefined` quando o estado não o traz (pedido corrompido). */
    readTarget(turn: GroupFlowTurn): GroupReminderTarget | undefined {
      const { idleVariant, reminderId, stage, tripStopId } = turn.request.state
      if (typeof reminderId !== 'string' || typeof tripStopId !== 'string') return undefined
      if (!isStage(stage)) return undefined
      return isIdleVariant(idleVariant)
        ? { idleVariant, reminderId, stage, tripStopId }
        : { reminderId, stage, tripStopId }
    },

    /** A ação da opção digitada ou falada ("2", "opção dois"); `undefined` fora das opções 1–4 da etapa. */
    pickAction(target: GroupReminderTarget, text: string): GroupReminderAction | undefined {
      const choice = spokenOptionNumber(text)
      return choice === undefined
        ? undefined
        : resolveStopReminderChoice({
            choice,
            idleVariant: target.idleVariant,
            stage: target.stage,
          })
    },

    readNoteNumber(turn: GroupFlowTurn, target: GroupReminderTarget): Promise<string | undefined> {
      return ports.readNoteNumber({
        companyId: turn.request.companyId,
        tripStopId: target.tripStopId,
      })
    },

    /** A opção 4: adia (ou conta como sem resposta) e fecha o pedido; o lembrete segue o relógio. */
    async postpone(turn: GroupFlowTurn, target: GroupReminderTarget): Promise<GroupFlowOutcome> {
      const { companyId } = turn.request
      const { outcome } = await ports.postpone({ companyId, reminderId: target.reminderId })
      const text = await ports.speech.text({ companyId, key: POSTPONE_SPEECH_KEY[outcome] })
      return { kind: 'done', replies: [text], withoutFarewell: true }
    },

    async notUnderstood(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const reason = await ports.speech.text({
        companyId: turn.request.companyId,
        key: 'lembreteOpcaoInvalida',
      })
      return { kind: 'not_understood', prompt: '', reason }
    },
  }
}

export type GroupReminderFlow = ReturnType<typeof createGroupReminderFlow>
