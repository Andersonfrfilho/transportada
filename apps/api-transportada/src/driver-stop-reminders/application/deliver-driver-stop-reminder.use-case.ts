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
  DRIVER_STOP_REMINDER_DEFER_REASON,
  DRIVER_STOP_REMINDER_DUE_ACTION,
  DRIVER_STOP_REMINDER_GATE_DECISION,
  DRIVER_STOP_REMINDER_OPEN_QUESTION_WAIT_MINUTES,
  DRIVER_STOP_REMINDER_OUTCOME,
  DRIVER_STOP_REMINDER_RECORD_SENT_MAX_ATTEMPTS,
  DRIVER_STOP_REMINDER_RECORD_SENT_RETRY_DELAY_MS,
  DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES,
  DRIVER_STOP_REMINDER_SPEECH_NODE,
  DRIVER_STOP_REMINDER_STAGE,
  DRIVER_STOP_REMINDER_STATUS,
  MILLISECONDS_PER_MINUTE,
} from '../domain/driver-stop-reminder.constant.js'
import {
  DriverStopReminderNotFoundError,
  ReminderPromptBusyError,
} from '../domain/driver-stop-reminder.error.js'
import { decideStopReminderGate } from '../domain/stop-reminder-gate.policy.js'
import {
  buildStopReminderMessage,
  capStopReminderBody,
  shortenStopBlock,
} from '../domain/stop-reminder-message.policy.js'
import {
  computeNextStopReminderDueAt,
  decideStopReminderDueAction,
} from '../domain/stop-reminder-schedule.policy.js'
import type {
  DirectReminderSender,
  DriverReminderChannelKind,
  DriverReminderChannelResolver,
} from './driver-reminder-channel-resolver.port.js'
import type { GroupStopReminderSenderPort } from './group-stop-reminder-sender.port.js'
import type {
  DeliverableStopReminder,
  DriverStopReminderDeliveryRepository,
  RecordStopReminderSentParams,
  StopReminderDeliveryContext,
} from './driver-stop-reminder-delivery.port.js'
import type { ReminderPromptOpener } from './reminder-prompt-opener.port.js'
import type { DriverOpenQuestionPort } from '../../whatsapp-commands/application/driver-open-question.port.js'
import type { BotSpeechKey } from '../../whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { WHATSAPP_TURN_MESSAGE_LIMIT } from '../../whatsapp-commands/application/whatsapp-turn-replies.service.js'
import type { WhatsAppBotSpeechPort } from '../../whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { hasDriverOpenQuestion } from '../../whatsapp-commands/domain/driver-open-question.policy.js'
import {
  describeStopCard,
  plainText,
  STOP_CARD_VOLUMES_TO_DELIVER_SUFFIX,
} from '../../whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import type { WhatsAppStopCardReader } from '../../whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { DriverStopReminderChannel } from '../../shared/driver-stop-reminder.constant.js'

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
const DRIVER_STOP_REMINDER_PROMPT_BUSY_REASON = 'prompt_busy'

function addMinutes(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * MILLISECONDS_PER_MINUTE)
}

export function createDeliverDriverStopReminderUseCase(dependencies: {
  /** Ausente: sempre grupo. */
  readonly channelResolver?: DriverReminderChannelResolver
  readonly clock?: () => Date
  /**
   * O envio individual da Fase 3. Enquanto ausente (ou `unavailable`), o canal `direct` cai no grupo na mesma
   * tentativa; a Fase 3 passa a implementação e este desvio deixa de ser alcançado.
   */
  readonly directSender?: DirectReminderSender | undefined
  readonly driverOpenQuestions: DriverOpenQuestionPort
  readonly isEnabled: boolean
  readonly logger?: ApiLogger
  readonly promptOpener: ReminderPromptOpener
  readonly repository: DriverStopReminderDeliveryRepository
  readonly sender: GroupStopReminderSenderPort
  readonly sleep?: (milliseconds: number) => Promise<void>
  readonly speech: WhatsAppBotSpeechPort
  /** Ausente, ou com a leitura fora, o lembrete sai sem o bloco da parada. */
  readonly stopCards?: Pick<WhatsAppStopCardReader, 'read'>
}): DeliverDriverStopReminderUseCase {
  const { repository } = dependencies
  const clock = dependencies.clock ?? (() => new Date())
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))

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
      version: reminder.version,
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
      version: reminder.version,
    })
    log(reminder, OUTCOME.DEFERRED, gate.reason)
    return { nextDueAt: gate.until, outcome: OUTCOME.DEFERRED } as const
  }

  /** O pedido que este lembrete deixou aberto numa tentativa anterior não é pergunta de outro fluxo. */
  async function readOpenQuestions(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    now: Date,
  ) {
    const questions = await dependencies.driverOpenQuestions.read({
      companyId: reminder.companyId,
      driverId: context.driver.id,
      now,
    })
    if (!questions.hasOpenGroupRequest || context.groupJid === undefined) return questions
    const isOwnPrompt = await dependencies.promptOpener.hasOwnOpen({
      companyId: reminder.companyId,
      groupJid: context.groupJid,
      reminderId: reminder.id,
    })
    return isOwnPrompt ? { ...questions, hasOpenGroupRequest: false } : questions
  }

  async function readStopBlock(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
  ): Promise<string> {
    const view = await dependencies.stopCards
      ?.read({
        companyId: reminder.companyId,
        driverId: context.driver.id,
        stopId: reminder.tripStopId,
      })
      .catch(() => null)
    return view === null || view === undefined
      ? ''
      : describeStopCard(view.card, { volumesSuffix: STOP_CARD_VOLUMES_TO_DELIVER_SUFFIX }).join(
          '\n',
        )
  }

  async function renderBody(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    now: Date,
  ) {
    const stopBlock = await readStopBlock(reminder, context)
    const render = async (block: string) => {
      const message = buildStopReminderMessage({
        arrivedAt:
          reminder.stage === DRIVER_STOP_REMINDER_STAGE.SETTLEMENT ? reminder.anchorAt : undefined,
        departedAt:
          reminder.stage === DRIVER_STOP_REMINDER_STAGE.ARRIVAL ? reminder.anchorAt : undefined,
        driverName: plainText(context.driver.name),
        expectedAt: reminder.expectedAt ?? undefined,
        isSharedPoint: reminder.originKind === 'shared_point',
        now,
        stage: reminder.stage,
        stopBlock: block,
        timeZone: context.timeZone,
      })
      const key = SPEECH_KEY_BY_NODE[message.nodeKey]
      if (key === undefined) throw new Error('DRIVER_STOP_REMINDER_SPEECH_KEY_UNKNOWN')
      const text = await dependencies.speech.text({
        companyId: reminder.companyId,
        key,
        params: message.variables,
      })
      return text.replace(/\n{3,}/gu, '\n\n')
    }
    const body = await render(stopBlock)
    const excess = body.length - WHATSAPP_TURN_MESSAGE_LIMIT
    if (excess <= 0) return body
    const shortened = await render(shortenStopBlock({ excess, stopBlock }))
    return capStopReminderBody({ body: shortened, limit: WHATSAPP_TURN_MESSAGE_LIMIT })
  }

  async function recordWithRetry(
    params: RecordStopReminderSentParams,
    attempt: number,
  ): Promise<boolean> {
    try {
      await repository.recordSent(params)
      return true
    } catch {
      if (attempt >= DRIVER_STOP_REMINDER_RECORD_SENT_MAX_ATTEMPTS) return false
      await sleep(DRIVER_STOP_REMINDER_RECORD_SENT_RETRY_DELAY_MS * attempt)
      return recordWithRetry(params, attempt + 1)
    }
  }

  /** O envio já saiu: nada daqui pode provocar um segundo envio rápido. */
  async function recordSent(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    sent: {
      readonly channel: DriverStopReminderChannel
      readonly now: Date
      readonly providerMessageId: string | null
    },
  ) {
    const nextDueAt = computeNextStopReminderDueAt({
      lastSentAt: sent.now,
      settings: context.settings,
    })
    const isRecorded = await recordWithRetry(
      {
        channel: sent.channel,
        companyId: reminder.companyId,
        nextDueAt,
        providerMessageId: sent.providerMessageId,
        reminderId: reminder.id,
        sentAt: sent.now,
        version: reminder.version,
      },
      1,
    )
    if (isRecorded) {
      log({ ...reminder, attempts: reminder.attempts + 1 }, OUTCOME.SENT)
      return { nextDueAt, outcome: OUTCOME.SENT } as const
    }
    dependencies.logger?.error(DRIVER_STOP_REMINDER_DELIVERY_LOG.RECORD_FAILED, {
      companyId: reminder.companyId,
      reminderId: reminder.id,
      stage: reminder.stage,
    })
    await repository.release({
      companyId: reminder.companyId,
      dueAt: nextDueAt,
      reminderId: reminder.id,
      version: reminder.version,
    })
    return { nextDueAt, outcome: OUTCOME.DEFERRED } as const
  }

  async function sendToGroup(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    groupJid: string,
    now: Date,
  ) {
    let isPromptOpen = false
    let providerMessageId: string | null
    try {
      await dependencies.promptOpener.open({
        companyId: reminder.companyId,
        driverId: context.driver.id,
        groupJid,
        reminderId: reminder.id,
        stage: reminder.stage,
        tripStopId: reminder.tripStopId,
      })
      isPromptOpen = true
      const body = await renderBody(reminder, context, now)
      const response = await dependencies.sender.send({
        body,
        companyId: reminder.companyId,
        groupJid,
        tripId: reminder.tripId,
      })
      providerMessageId = response.providerMessageId
    } catch (error) {
      if (isPromptOpen) {
        await dependencies.promptOpener.discard({
          companyId: reminder.companyId,
          groupJid,
          reminderId: reminder.id,
        })
      }
      return releaseAfterFailure(reminder, now, error)
    }
    return recordSent(reminder, context, { channel: 'group', now, providerMessageId })
  }

  async function releaseAfterFailure(reminder: DeliverableStopReminder, now: Date, error: unknown) {
    const retryAt = addMinutes(now, DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES)
    await repository.release({
      companyId: reminder.companyId,
      dueAt: retryAt,
      reminderId: reminder.id,
      version: reminder.version,
    })
    if (error instanceof ReminderPromptBusyError) {
      log(reminder, OUTCOME.DEFERRED, DRIVER_STOP_REMINDER_PROMPT_BUSY_REASON)
      return { nextDueAt: retryAt, outcome: OUTCOME.DEFERRED } as const
    }
    dependencies.logger?.warn(DRIVER_STOP_REMINDER_DELIVERY_LOG.SEND_FAILED, {
      companyId: reminder.companyId,
      errorName: error instanceof Error ? error.name : typeof error,
      reminderId: reminder.id,
      stage: reminder.stage,
    })
    return { nextDueAt: retryAt, outcome: OUTCOME.DEFERRED } as const
  }

  /** `undefined` quando o individual não está disponível: a entrega segue pelo grupo. */
  async function sendDirect(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    now: Date,
  ) {
    if (dependencies.directSender === undefined) return undefined
    const result = await dependencies.directSender.send({
      body: await renderBody(reminder, context, now),
      companyId: reminder.companyId,
      driverId: context.driver.id,
      reminderId: reminder.id,
      stage: reminder.stage,
      tripStopId: reminder.tripStopId,
    })
    if (result.status === 'unavailable') return undefined
    return recordSent(reminder, context, {
      channel: result.channel,
      now,
      providerMessageId: result.providerMessageId,
    })
  }

  async function send(
    reminder: DeliverableStopReminder,
    context: StopReminderDeliveryContext,
    channel: DriverReminderChannelKind,
    now: Date,
  ) {
    const reservedVersion = await repository.reserveAttempt({
      companyId: reminder.companyId,
      dispatchingUntil: addMinutes(now, DRIVER_STOP_REMINDER_DISPATCH_RESERVATION_MINUTES),
      now,
      reminderId: reminder.id,
      version: reminder.version,
    })
    if (reservedVersion === undefined) {
      log(reminder, OUTCOME.DEFERRED, 'already_reserved')
      return { nextDueAt: reminder.dueAt, outcome: OUTCOME.DEFERRED } as const
    }
    const reserved = { ...reminder, version: reservedVersion }
    // Outro fluxo pode ter aberto uma pergunta entre a leitura do portão e a reserva (RF8.3).
    const questions = await readOpenQuestions(reserved, context, now)
    if (hasDriverOpenQuestion(questions)) {
      return defer(reserved, {
        reason: DRIVER_STOP_REMINDER_DEFER_REASON.OPEN_QUESTION,
        until: addMinutes(now, DRIVER_STOP_REMINDER_OPEN_QUESTION_WAIT_MINUTES),
      })
    }
    if (channel === 'direct') {
      try {
        const direct = await sendDirect(reserved, context, now)
        if (direct !== undefined) return direct
      } catch (error) {
        return releaseAfterFailure(reserved, now, error)
      }
    }
    if (context.groupJid !== undefined) return sendToGroup(reserved, context, context.groupJid, now)
    return releaseAfterFailure(reserved, now, new Error(DRIVER_STOP_REMINDER_NO_GROUP_REASON))
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

      const questions = await readOpenQuestions(reminder, context, now)
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
      const channel = await dependencies.channelResolver?.resolve({
        companyId,
        driverId: context.driver.id,
      })
      const hasDirectPath = channel === 'direct' && dependencies.directSender !== undefined
      if (context.groupJid === undefined && !hasDirectPath) {
        return defer(reminder, {
          reason: DRIVER_STOP_REMINDER_NO_GROUP_REASON,
          until: addMinutes(now, context.settings.intervalMinutes),
        })
      }
      return send(reminder, context, channel ?? 'group', now)
    },
  }
}
