/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 126: o regime federal e as alíquotas de PIS/COFINS que a conta da viagem desconta da receita.
 * Quem sabe a alíquota é o contador — a API grava o que a empresa afirma, e deixa trilha de quem
 * mudou, porque ela mexe na margem de toda viagem.
 */
import type {
  FederalTaxRates,
  FederalTaxSettings,
  FederalTaxSettingsPort,
} from './federal-tax-settings.port.js'

const SAVED_ACTION = 'company-federal-tax.saved'
const CLEARED_ACTION = 'company-federal-tax.cleared'

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

export function createGetFederalTaxSettingsUseCase(dependencies: {
  readonly settings: FederalTaxSettingsPort
}): {
  readonly execute: (input: { readonly companyId: string }) => Promise<FederalTaxSettings | null>
} {
  return { execute: (input) => dependencies.settings.find({ companyId: input.companyId }) }
}

export function createSetFederalTaxSettingsUseCase(dependencies: {
  readonly settings: FederalTaxSettingsPort
}): { readonly execute: (input: Actor & FederalTaxRates) => Promise<FederalTaxSettings> } {
  return {
    execute: async (input) => {
      const before = await dependencies.settings.find({ companyId: input.companyId })
      const saved = await dependencies.settings.upsert({
        cofinsRate: input.cofinsRate,
        companyId: input.companyId,
        federalRegime: input.federalRegime,
        pisRate: input.pisRate,
        updatedByUserId: input.userId,
      })
      await dependencies.settings.appendAudit({
        action: SAVED_ACTION,
        actorUserId: input.userId,
        after: toRates(input),
        before: before === null ? null : toRates(before),
        companyId: input.companyId,
        correlationId: input.correlationId,
      })

      return saved
    },
  }
}

/** Voltar a "não declarado". Sem linha não há o que registrar: apagar o nada não é mudança. */
export function createClearFederalTaxSettingsUseCase(dependencies: {
  readonly settings: FederalTaxSettingsPort
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
        before: toRates(before),
        companyId: input.companyId,
        correlationId: input.correlationId,
      })
    },
  }
}

function toRates(value: FederalTaxRates): FederalTaxRates {
  return {
    cofinsRate: value.cofinsRate,
    federalRegime: value.federalRegime,
    pisRate: value.pisRate,
  }
}
