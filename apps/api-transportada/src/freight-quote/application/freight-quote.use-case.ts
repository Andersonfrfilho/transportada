/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Orçamento de frete pelo custo da viagem (spec 326). O cálculo **não grava nada**: é consulta. O que
 * a empresa mexe fica em `company_freight_quote_settings`, com trilha de quem mudou, porque muda o
 * preço de todo orçamento.
 */
import { resolveEffectiveFuelPrices } from '../../companies/domain/fuel-price.policy.js'
import type { FuelPricePort } from '../../companies/application/fuel-price.port.js'
import type { AnttCargoTypeCode } from '../domain/antt-floor.constant.js'
import { FREIGHT_QUOTE_DEFAULTS } from '../domain/freight-quote-defaults.constant.js'
import {
  calculateFreightQuote,
  FreightQuoteInputError,
  type FreightQuoteResult,
  type FreightQuoteSettingsValues,
} from '../domain/freight-quote.policy.js'
import type {
  FreightQuoteSettingsPort,
  FreightQuoteSettingsRecord,
} from './freight-quote-settings.port.js'

const SAVED_ACTION = 'company-freight-quote-settings.saved'
const CLEARED_ACTION = 'company-freight-quote-settings.cleared'

export type FreightQuoteSettingsView = {
  readonly origin: 'company' | 'default'
  readonly updatedAt: Date | null
  readonly values: FreightQuoteSettingsValues
}

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

export function createGetFreightQuoteSettingsUseCase(dependencies: {
  readonly settings: FreightQuoteSettingsPort
}): {
  readonly execute: (input: { readonly companyId: string }) => Promise<FreightQuoteSettingsView>
} {
  return {
    execute: async (input) =>
      toView(await dependencies.settings.find({ companyId: input.companyId })),
  }
}

export function createSetFreightQuoteSettingsUseCase(dependencies: {
  readonly settings: FreightQuoteSettingsPort
}): {
  readonly execute: (
    input: Actor & { readonly values: FreightQuoteSettingsValues },
  ) => Promise<FreightQuoteSettingsView>
} {
  return {
    execute: async (input) => {
      const before = await dependencies.settings.find({ companyId: input.companyId })
      const saved = await dependencies.settings.upsert({
        companyId: input.companyId,
        updatedByUserId: input.userId,
        values: input.values,
      })
      await dependencies.settings.appendAudit({
        action: SAVED_ACTION,
        actorUserId: input.userId,
        after: input.values,
        before: before === null ? null : before.values,
        companyId: input.companyId,
        correlationId: input.correlationId,
      })
      return toView(saved)
    },
  }
}

/** Voltar aos valores iniciais do sistema. Sem linha não há o que registrar. */
export function createClearFreightQuoteSettingsUseCase(dependencies: {
  readonly settings: FreightQuoteSettingsPort
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
        before: before.values,
        companyId: input.companyId,
        correlationId: input.correlationId,
      })
    },
  }
}

export type FreightQuoteRequest = {
  readonly axles: number
  readonly cargoType: AnttCargoTypeCode
  readonly cargoValue: string
  readonly companyId: string
  readonly distanceKm: string
  readonly fuelPricePerLitre: string | null
  readonly highPerformance: boolean
  readonly shareOfVehiclePercent: string
  readonly tollAmount: string
}

export type FreightQuoteResponse = FreightQuoteResult & {
  readonly fuelPriceOrigin: 'informed' | 'company-or-anp'
  readonly fuelPricePerLitre: string
  readonly settingsOrigin: 'company' | 'default'
}

export class FreightQuoteFuelPriceMissingError extends Error {
  public constructor() {
    super('FREIGHT_QUOTE_FUEL_PRICE_MISSING')
    this.name = 'FreightQuoteFuelPriceMissingError'
  }
}

export function createCalculateFreightQuoteUseCase(dependencies: {
  readonly fuelPrices: FuelPricePort
  readonly settings: FreightQuoteSettingsPort
}): { readonly execute: (input: FreightQuoteRequest) => Promise<FreightQuoteResponse> } {
  return {
    execute: async (input) => {
      const settings = toView(await dependencies.settings.find({ companyId: input.companyId }))
      const informed = input.fuelPricePerLitre
      const fuelPrice =
        informed ?? (await resolveDieselPrice(dependencies.fuelPrices, input.companyId))
      if (fuelPrice === null) throw new FreightQuoteFuelPriceMissingError()

      const result = calculateFreightQuote({
        axles: input.axles,
        cargoType: input.cargoType,
        cargoValue: input.cargoValue,
        distanceKm: input.distanceKm,
        fuelPricePerLitre: fuelPrice,
        highPerformance: input.highPerformance,
        settings: settings.values,
        shareOfVehiclePercent: input.shareOfVehiclePercent,
        tollAmount: input.tollAmount,
      })
      return {
        ...result,
        fuelPriceOrigin: informed === null ? 'company-or-anp' : 'informed',
        fuelPricePerLitre: fuelPrice,
        settingsOrigin: settings.origin,
      }
    },
  }
}

async function resolveDieselPrice(
  fuelPrices: FuelPricePort,
  companyId: string,
): Promise<string | null> {
  const prices = resolveEffectiveFuelPrices(await fuelPrices.loadFacts({ companyId }))
  for (const product of ['diesel-s10', 'diesel-s500'] as const) {
    const price = prices.find((entry) => entry.product === product)?.effectivePricePerUnit
    if (price !== null && price !== undefined) return price
  }
  return null
}

function toView(record: FreightQuoteSettingsRecord | null): FreightQuoteSettingsView {
  if (record === null) {
    return { origin: 'default', updatedAt: null, values: { ...FREIGHT_QUOTE_DEFAULTS } }
  }
  return { origin: 'company', updatedAt: record.updatedAt, values: record.values }
}

export { FreightQuoteInputError }
