/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteData,
  CteIcms,
  CteMunicipio,
  CteParticipante,
} from '@adatechnology/fiscal-provider'

import {
  FISCAL_MONEY_SCALE,
  MONEY_SCALE,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  parseScaledDecimal,
  rescaleHalfUp,
} from '../../shared/decimal.service.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'

import { composeCargoQuantities, resolvePredominantProduct } from './cte-cargo.service.js'
import {
  CtePayloadEmptySelectionError,
  CtePayloadInconsistentPartiesError,
  CtePayloadInvalidTaxIdError,
  CtePayloadUnsupportedIcmsError,
  CtePayloadUnsupportedModalError,
} from './cte-payload.error.js'
import { resolveReceiverIeIndicator } from './cte-receiver-ie.policy.js'
import type {
  BuildCtePayloadParams,
  CtePayloadInvoice,
  CtePayloadParty,
  CtePayloadProfile,
} from './cte-payload.types.js'

const ERROR_CODE_PREFIX = 'CTE_PAYLOAD'
const CNPJ_LENGTH = 14
const CPF_LENGTH = 11
const RECEIVER_PICKUP_AT_DESTINATION = '0'
const ROAD_MODAL = '01'
const PERCENTAGE_FROM_FRACTION = 100n

function parseMoney(value: string): bigint {
  return rescaleHalfUp({
    fromScale: MONEY_SCALE,
    toScale: FISCAL_MONEY_SCALE,
    value: parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: MONEY_SCALE, value }),
  })
}

function toMoney(value: bigint): number {
  return Number(formatScaledDecimal(value, FISCAL_MONEY_SCALE))
}

function parseRate(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: PERCENTAGE_SCALE, value })
}

function toPercentage(rateScaled: bigint): number {
  return Number(formatScaledDecimal(rateScaled * PERCENTAGE_FROM_FRACTION, PERCENTAGE_SCALE))
}

function toParticipante(party: CtePayloadParty): CteParticipante {
  const identification =
    party.taxId.length === CNPJ_LENGTH
      ? { cnpj: party.taxId }
      : party.taxId.length === CPF_LENGTH
        ? { cpf: party.taxId }
        : null
  if (identification === null) throw new CtePayloadInvalidTaxIdError(party.taxId)

  return {
    ...identification,
    ...(party.stateRegistration === null ? {} : { ie: party.stateRegistration }),
    ...(party.tradeName === null ? {} : { xFant: party.tradeName }),
    ...(party.postalCode === null ? {} : { cep: party.postalCode }),
    ...(party.phone === null ? {} : { fone: party.phone }),
    ...(party.email === null ? {} : { email: party.email }),
    ...(party.complement === null ? {} : { xCpl: party.complement }),
    cMun: party.cityCode,
    nro: party.number,
    uf: party.state,
    xBairro: party.district,
    xLgr: party.street,
    xMun: party.city,
    xNome: party.legalName,
  }
}

function toMunicipio(party: CtePayloadParty): CteMunicipio {
  return { codigo: party.cityCode, nome: party.city, uf: party.state }
}

function composeIcms(
  input: Readonly<{ profile: CtePayloadProfile; totalScaled: bigint }>,
): CteIcms {
  const { profile, totalScaled } = input
  const rateScaled = parseRate(profile.icmsRate)

  if (profile.icmsCst === '60') throw new CtePayloadUnsupportedIcmsError(profile.icmsCst)
  if (profile.icmsCst === '40' || profile.icmsCst === '41' || profile.icmsCst === '51') {
    return { cst: profile.icmsCst }
  }
  if (profile.icmsCst === '90') {
    if (rateScaled === 0n) return { cst: '90' }
    return {
      cst: '90',
      pICMS: toPercentage(rateScaled),
      vBC: toMoney(totalScaled),
      vICMS: toMoney(applyRate({ amountScaled: totalScaled, rateScaled })),
    }
  }
  if (profile.icmsCst === '00') {
    return {
      cst: '00',
      pICMS: toPercentage(rateScaled),
      vBC: toMoney(totalScaled),
      vICMS: toMoney(applyRate({ amountScaled: totalScaled, rateScaled })),
    }
  }

  const reductionScaled = parseRate(profile.icmsBaseReductionRate)
  const baseScaled =
    totalScaled - applyRate({ amountScaled: totalScaled, rateScaled: reductionScaled })
  return {
    cst: '20',
    pICMS: toPercentage(rateScaled),
    pRedBC: toPercentage(reductionScaled),
    vBC: toMoney(baseScaled),
    vICMS: toMoney(applyRate({ amountScaled: baseScaled, rateScaled })),
  }
}

function assertConsistentParties(invoices: readonly CtePayloadInvoice[]): CtePayloadInvoice {
  const [first] = invoices
  if (first === undefined) throw new CtePayloadEmptySelectionError()

  const isConsistent = invoices.every(
    (invoice) =>
      invoice.sender.taxId === first.sender.taxId &&
      invoice.recipient.taxId === first.recipient.taxId,
  )
  if (!isConsistent) throw new CtePayloadInconsistentPartiesError()

  return first
}

function composePickupDetails(profile: CtePayloadProfile): { readonly xDetRetira?: string } {
  if (profile.pickupIndicator !== RECEIVER_PICKUP_AT_DESTINATION) return {}
  if (profile.pickupDetails.length === 0) return {}
  return { xDetRetira: profile.pickupDetails }
}

// A previsão de entrega é o próprio dia da emissão, resolvido no fuso fiscal: às 22h de Brasília
// o instante já é o dia seguinte em UTC, e dPrev anunciaria uma entrega para amanhã.
function composeDeliveryForecast(issuedAt: string | undefined): { readonly dPrev?: string } {
  if (issuedAt === undefined) return {}
  return { dPrev: formatFiscalDay(new Date(issuedAt)) }
}

export function buildCtePayload(params: BuildCtePayloadParams): CteData {
  const { carrier, charge, invoices, issuedAt, profile } = params
  if (profile.modal !== ROAD_MODAL) throw new CtePayloadUnsupportedModalError(profile.modal)

  const reference = assertConsistentParties(invoices)
  const totalScaled = parseMoney(charge.totalAmount)
  const cargoScaled = invoices.reduce(
    (total, invoice) => total + parseMoney(invoice.totalAmount),
    0n,
  )
  const isInterstate = reference.sender.state !== reference.recipient.state
  const deliveryForecast = composeDeliveryForecast(issuedAt)

  return {
    carga: {
      proPred: resolvePredominantProduct({ invoices, profile }),
      quantidades: composeCargoQuantities(invoices),
      vCarga: toMoney(cargoScaled),
      // O valor averbado é o da mercadoria, não o da prestação: é o que a seguradora cobre.
      vCargaAverb: toMoney(cargoScaled),
    },
    cfop: isInterstate ? profile.cfopInterstate : profile.cfopInternal,
    componentesValor: charge.components.map((component) => ({
      vComp: toMoney(parseMoney(component.amount)),
      xNome: component.label,
    })),
    destinatario: toParticipante(reference.recipient),
    documentos: invoices.map((invoice) => ({
      chave: invoice.accessKey,
      ...deliveryForecast,
      tipo: 'nfe' as const,
    })),
    icms: composeIcms({ profile, totalScaled }),
    indIEToma: resolveReceiverIeIndicator({ invoice: reference, profile }),
    ...(profile.observations === null || profile.observations.length === 0
      ? {}
      : { informacoesAdicionais: profile.observations }),
    modal: { modal: ROAD_MODAL, rntrc: carrier.rntrc },
    municipioDestino: toMunicipio(reference.recipient),
    municipioOrigem: toMunicipio(reference.sender),
    naturezaOperacao: profile.operationNature,
    remetente: toParticipante(reference.sender),
    retira: profile.pickupIndicator,
    tipoServico: profile.serviceType,
    tomador: profile.taker,
    valorTotalPrestacao: toMoney(totalScaled),
    valorTotalReceber: toMoney(totalScaled),
    ...composePickupDetails(profile),
  }
}
