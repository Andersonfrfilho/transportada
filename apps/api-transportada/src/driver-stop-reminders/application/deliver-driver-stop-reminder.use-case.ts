/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2 (RF8, RF12): a entrega de um lembrete vencido, chamada pelo robô do worker. A decisão mora aqui
 * (o worker só marca o relógio). Ordem: a empresa é dona do lembrete (BOLA, 404) → chaves → portão do RF8
 * (parada andou fecha; horário; pergunta aberta; vaga) → reserva atômica por `version` → passo → envio → tentativa.
 *
 * Decisões: chave desligada devolve `deferred` sem tocar a linha (a consulta do worker já só traz empresa ligada);
 * a escalada não manda nada ao motorista, então o horário, a pergunta aberta e a vaga não a seguram.
 */
import {
  DRIVER_STOP_REMINDER_DELIVERY_LOG,
  DRIVER_STOP_REMINDER_DISPATCH_RESERVATION_MINUTES,
  DRIVER_STOP_REMINDER_DUE_ACTION,
  DRIVER_STOP_REMINDER_GATE_DECISION,
  DRIVER_STOP_REMINDER_OUTCOME,
  DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES,
  DRIVER_STOP_REMINDER_SPEECH_NODE,
  DRIVER_STOP_REMINDER_STAGE,
  DRIVER_STOP_REMINDER_STATUS,
  MILLISECONDS_PER_MINUTE,
} from '../domain/driver-stop-reminder.constant.js'
import { DriverStopReminderNotFoundError } from '../domain/driver-stop-reminder.error.js'
import { decideStopReminderGate } from '../domain/stop-reminder-gate.policy.js'
import { buildStopReminderMessage } from '../domain/stop-reminder-message.policy.js'
import {
  computeNextStopReminderDueAt,
  decideStopReminderDueAction,
} from '../domain/stop-reminder-schedule.policy.js'
import type { GroupStopReminderSenderPort } from './group-stop-reminder-sender.port.js'
import type {
  DeliverableStopReminder,
  DriverStopReminderDeliveryRepository,
  StopReminderDeliveryContext,
} from './driver-stop-reminder-delivery.port.js'
import type { ReminderPromptOpener } from './reminder-prompt-opener.port.js'
import type { DriverOpenQuestionPort } from '../../whatsapp-commands/application/driver-open-question.port.js'
import type { BotSpeechKey } from '../../whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import type { WhatsAppBotSpeechPort } from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { hasDriverOpenQuestion } from '../../whatsapp-commands/domain/driver-open-question.policy.js'
import { plainText } from '../../whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import type { ApiLogger } from '../../shared/api.types.js'

export type DeliverDriverStopReminderParams = {
  readonly companyId: string
  readonly reminderId: string
}

export type DeliverDriverStopReminderResult = {
  readonly outcome: (typeof DRIVER_STOP_REMINDER_OUTCOME)[keyof typeof DRIVER_STOP_REMINDER_OUTCOME]
  readonly nextDueAt: Date | null
}

export type DeliverDriverStopReminderUseCase = {
  execute(params: DeliverDriverStopReminderParams): Promise<DeliverDriverStopReminderResult>
}

const SPEECH_KEY_BY_NODE: Readonly<Record<string, BotSpeechKey>> = {
  [DRIVER_STOP_REMINDER_SPEECH_NODE.arrival]: 'lembreteChegada',
  [DRIVER_STOP_REMINDER_SPEECH_NODE.arrivalWithoutEstimate]: 'lembreteChegadaSemPrevisao',
  [DRIVER_STOP_REMINDER_SPEECH_NODE.settlement]: 'lembreteEntrega',
}

const OUTCOME = DRIVER_STOP_REMINDER_OUTCOME
const DRIVER_STOP_REMINDER_NO_GROUP_REASON = 'no_group'

function addMinutes(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * MILLISECONDS_PER_MINUTE)
}

export function createDeliverDriverStopReminderUseCase(dependencies: {
  readonly clock?: () => Date
  readonly driverOpenQuestions: DriverOpenQuestionPort
  readonly isEnabled: boolean
  readonly logger?: ApiLogger
  readonly promptOpener: ReminderPromptOpener
  readonly repository: DriverStopReminderDeliveryRepository
  readonly sender: GroupStopReminderSenderPort
  readonly speech: WhatsAppBotSpeechPort
}): DeliverDriverStopReminderUseCase {
  const { repository } = dependencies
  const clock = dependencies.clock ?? (() => new Date())

  function log(reminder: DeliverableStopReminder, outcome: string, reason?: string): void {
    dependencies.logger?.info(DRIVER_STOP_REMINDER_DELIVERY_LOG.DELIVERED, {
      attempt: reminder.attempts,
      companyId: reminder.companyId,
      outcome,
      reason,
      reminderId: reminder.id,
      stage: reminder.stage,
      tripStopId: reminder.tripStopId,
    })
  }

  async function closeStage(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    now: Date,
  ) {
    const reason =
      reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL && !context.stop.isClosed
        ? 'arrived'
        : 'stop_closed'
    await repository.close({
      closedAt: now,
      companyId: reminder.companyId,
      reason,
      reminderId: reminder.id,
    })
    log(reminder, OUTCOME.CLOSED, reason)
    return { nextDueAt: null, outcome: OUTCOME.CLOSED } as const
  }

  async function defer(
    reminder: DeliverableStopReminder,
    gate: { readonly reason: string; readonly until: Date },
  ) {
    await repository.release({
      companyId: reminder.companyId,
      dueAt: gate.until,
      reminderId: reminder.id,
    })
    log(reminder, OUTCOME.DEFERRED, gate.reason)
    return { nextDueAt: gate.until, outcome: OUTCOME.DEFERRED } as const
  }

  async function renderBody(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
  ) {
    const message = buildStopReminderMessage({
      arrivedAt:
        reminder.stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT ? reminder.anchorAt : undefined,
      departedAt:
        reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL ? reminder.anchorAt : undefined,
      driverName: plainText(context.driver.name),
      expectedAt: reminder.expectedAt ?? undefined,
      isSharedPoint: reminder.originKind === 'shared_point',
      stage: reminder.stage,
      stop: {
        clientName: plainText(context.stop.clientName),
        firstNoteNumber: plainText(context.stop.firstNoteNumber),
        noteCount: context.stop.noteCount,
      },
      timeZone: context.timeZone,
    })
    const key = SPEECH_KEY_BY_NODE[message.nodeKey]
    if (key === undefined) throw new Error('DRIVER_STOP_REMINDER_SPEECH_KEY_UNKNOWN')
    return dependencies.speech.text({
      companyId: reminder.companyId,
      key,
      params: message.variables,
    })
  }

  async function send(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    groupJid: string,
    now: Date,
  ) {
    const reserved = await repository.reserveAttempt({
      companyId: reminder.companyId,
      dispatchingUntil: addMinutes(now, DRIVER_STOP_REMINDER_DISPATCH_RESERVATION_MINUTES),
      now,
      reminderId: reminder.id,
      version: reminder.version,
    })
    if (!reserved) {
      log(reminder, OUTCOME.DEFERRED, 'already_reserved')
      return { nextDueAt: reminder.dueAt, outcome: OUTCOME.DEFERRED } as const
    }
    try {
      await dependencies.promptOpener.open({
        companyId: reminder.companyId,
        driverId: context.driver.id,
        groupJid,
        reminderId: reminder.id,
        stage: reminder.stage,
        tripStopId: reminder.tripStopId,
      })
      const body = await renderBody(reminder, context)
      const { providerMessageId } = await dependencies.sender.send({
        body,
        companyId: reminder.companyId,
        groupJid,
        tripId: reminder.tripId,
      })
      const nextDueAt = computeNextStopReminderDueAt({
        lastSentAt: now,
        settings: context.settings,
      })
      await repository.recordSent({
        channel: 'group',
        companyId: reminder.companyId,
        nextDueAt,
        providerMessageId,
        reminderId: reminder.id,
        sentAt: now,
      })
      log({ ...reminder, attempts: reminder.attempts + 1 }, OUTCOME.SENT)
      return { nextDueAt, outcome: OUTCOME.SENT } as const
    } catch (error) {
      const retryAt = addMinutes(now, DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES)
      await repository.release({
        companyId: reminder.companyId,
        dueAt: retryAt,
        reminderId: reminder.id,
      })
      dependencies.logger?.warn(DRIVER_STOP_REMINDER_DELIVERY_LOG.SEND_FAILED, {
        companyId: reminder.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        reminderId: reminder.id,
        stage: reminder.stage,
      })
      return { nextDueAt: retryAt, outcome: OUTCOME.DEFERRED } as const
    }
  }

  return {
    async execute({ companyId, reminderId }) {
      const reminder = await repository.findReminder({ companyId, reminderId })
      if (reminder === undefined) throw new DriverStopReminderNotFoundError()
      if (reminder.status === DRIVER_STOP_REMINDER_STATUS.ESCALATED) {
        return { nextDueAt: null, outcome: OUTCOME.ESCALATED }
      }
      if (reminder.status !== DRIVER_STOP_REMINDER_STATUS.PENDING) {
        return { nextDueAt: null, outcome: OUTCOME.CLOSED }
      }
      const now = clock()
      if (!dependencies.isEnabled) return { nextDueAt: reminder.dueAt, outcome: OUTCOME.DEFERRED }
      const context = await repository.readContext({ now, reminder })
      if (!context.settings.enabled) return { nextDueAt: reminder.dueAt, outcome: OUTCOME.DEFERRED }

      const questions = await dependencies.driverOpenQuestions.read({
        companyId,
        driverId: context.driver.id,
        now,
      })
      const gate = decideStopReminderGate({
        holidayDates: context.holidayDates,
        hasOpenQuestion: hasDriverOpenQuestion(questions),
        now,
        operatingHours: context.settings.operatingHours,
        sendSlotAt: context.sendSlotAt,
        stage: reminder.stage,
        stop: context.stop,
        timeZone: context.timeZone,
      })
      if (gate.decision === DRIVER_STOP_REMINDER_GATE_DECISION.CLOSE) {
        return closeStage(reminder, context, now)
      }
      const dueAction = decideStopReminderDueAction({
        attempts: reminder.attempts,
        maxAttempts: context.settings.maxAttempts,
      })
      if (dueAction === DRIVER_STOP_REMINDER_DUE_ACTION.ESCALATE) {
        await repository.escalate({ companyId, escalatedAt: now, reminderId })
        log(reminder, OUTCOME.ESCALATED)
        return { nextDueAt: null, outcome: OUTCOME.ESCALATED }
      }
      if (gate.decision === DRIVER_STOP_REMINDER_GATE_DECISION.DEFER) return defer(reminder, gate)
      if (context.groupJid === undefined) {
        return defer(reminder, {
          reason: DRIVER_STOP_REMINDER_NO_GROUP_REASON,
          until: addMinutes(now, context.settings.intervalMinutes),
        })
      }
      return send(reminder, context, context.groupJid, now)
    },
  }
}
