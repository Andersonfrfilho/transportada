/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 D3: o valor geral de diária que a empresa paga quando o motorista não tem valor
 * combinado só com ele. A API grava o que a empresa afirma, e deixa trilha de quem mudou, porque
 * mexe no custo de toda viagem.
 */
import type {
  DriverAllowanceSettings,
  DriverAllowanceSettingsPort,
} from './driver-allowance-settings.port.js'

const SAVED_ACTION = 'company-driver-allowance.saved'
const CLEARED_ACTION = 'company-driver-allowance.cleared'

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

export function createGetDriverAllowanceSettingsUseCase(dependencies: {
  readonly settings: DriverAllowanceSettingsPort
}): {
  readonly execute: (input: {
    readonly companyId: string
  }) => Promise<DriverAllowanceSettings | null>
} {
  return { execute: (input) => dependencies.settings.find({ companyId: input.companyId }) }
}

export function createSetDriverAllowanceSettingsUseCase(dependencies: {
  readonly settings: DriverAllowanceSettingsPort
}): {
  readonly execute: (input: Actor & { readonly amount: string }) => Promise<DriverAllowanceSettings>
} {
  return {
    execute: async (input) => {
      const before = await dependencies.settings.find({ companyId: input.companyId })
      const saved = await dependencies.settings.upsert({
        amount: input.amount,
        companyId: input.companyId,
        updatedByUserId: input.userId,
      })
      await dependencies.settings.appendAudit({
        action: SAVED_ACTION,
        actorUserId: input.userId,
        after: input.amount,
        before: before === null ? null : before.amount,
        companyId: input.companyId,
        correlationId: input.correlationId,
      })

      return saved
    },
  }
}

/** Voltar ao padrão do sistema. Sem linha não há o que registrar: apagar o nada não é mudança. */
export function createClearDriverAllowanceSettingsUseCase(dependencies: {
  readonly settings: DriverAllowanceSettingsPort
}): { readonly execute: (input: Actor) => Promise<void> } {
  return {
    execute: async (input) => {
      const before = await dependencies.settings.find({ companyId: input.companyId })
      if (before === null) return

      await dependencies.settings.remove({ companyId: input.companyId })
      await dependencies.settings.appendAudit({
        action: CLEARED_ACTION,
        actorUserId: input.userId,
        after: null,
        before: before.amount,
        companyId: input.companyId,
        correlationId: input.correlationId,
      })
    },
  }
}
