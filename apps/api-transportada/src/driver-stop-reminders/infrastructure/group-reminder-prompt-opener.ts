/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { GROUP_DRIVER_STEP } from '../../whatsapp/application/whatsapp-group-driver-flow.service.js'
import { GROUP_REMINDER_STEP } from '../../whatsapp/application/whatsapp-group-reminder-flow.service.js'
import type { GroupRequestRepositoryPort } from '../../whatsapp/application/whatsapp-group-request.port.js'
import type { ReminderPromptOpener } from '../application/reminder-prompt-opener.port.js'
import { ReminderPromptBusyError } from '../domain/driver-stop-reminder.error.js'

const REMINDER_STAGE_STEP = `${GROUP_DRIVER_STEP.reminderPrefix}${GROUP_REMINDER_STEP.stage}`

/**
 * Spec 299 T2.3 (RF14): o pedido aberto do grupo no passo `reminder.stage`, dono = o motorista (sem telefone válido, sem
 * dono: só quem marca o bot responde). A reserva atômica é o índice único parcial do grupo.
 */
export function createGroupReminderPromptOpener(dependencies: {
  readonly clock: () => Date
  readonly readDriverNumber: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<string | undefined>
  readonly repository: GroupRequestRepositoryPort
}): ReminderPromptOpener {
  const { repository } = dependencies

  async function findOwnOpen(input: {
    readonly companyId: string
    readonly groupJid: string
    readonly reminderId: string
  }) {
    const open = await repository.findOpen({
      companyId: input.companyId,
      groupJid: input.groupJid,
      now: dependencies.clock(),
    })
    const isOwn = open?.step === REMINDER_STAGE_STEP && open.state.reminderId === input.reminderId
    return isOwn ? open : null
  }

  return {
    async hasOwnOpen(input) {
      return (await findOwnOpen(input)) !== null
    },

    async discard({ companyId, groupJid, reminderId }) {
      const open = await findOwnOpen({ companyId, groupJid, reminderId })
      if (open === null) return
      await repository.update({
        attempts: open.attempts,
        close: 'cancelled',
        companyId,
        id: open.id,
        now: dependencies.clock(),
        state: open.state,
        step: open.step,
        version: open.version,
      })
    },

    async open({ companyId, driverId, groupJid, reminderId, stage, tripStopId }) {
      const ownerNumber = await dependencies.readDriverNumber({ companyId, driverId })
      const previous = await findOwnOpen({ companyId, groupJid, reminderId })
      const request = await repository.open({
        companyId,
        driverId,
        groupJid,
        now: dependencies.clock(),
        ownerNumber: ownerNumber ?? '',
        ...(previous === null ? {} : { replaces: { id: previous.id, version: previous.version } }),
        state: { reminderId, stage, tripStopId },
        step: REMINDER_STAGE_STEP,
      })
      if (request === null) throw new ReminderPromptBusyError()
    },
  }
}
