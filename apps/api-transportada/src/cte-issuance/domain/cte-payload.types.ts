/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteIcmsCst,
  CteModal,
  CtePickupIndicator,
  CtePredominantProductMode,
  CteReceiverIeIndicator,
  CteServiceType,
  CteTaker,
} from '../../database/cte-emission-profile.schema.js'

export type CtePayloadParty = {
  readonly city: string
  readonly cityCode: string
  readonly complement: null | string
  readonly district: string
  readonly email: null | string
  readonly legalName: string
  readonly number: string
  readonly phone: null | string
  readonly postalCode: null | string
  readonly state: string
  readonly stateRegistration: null | string
  readonly street: string
  readonly taxId: string
  readonly tradeName: null | string
}

export type CtePayloadProduct = {
  readonly description: string
  readonly grossWeight: null | string
  /** nItem da NF-e — desempate estável do produto predominante. */
  readonly ordinal: number
  readonly quantity: null | string
  readonly totalValue: string
}

export type CtePayloadVolume = {
  readonly grossWeight: null | string
  readonly netWeight: null | string
  readonly quantity: null | string
}

export type CtePayloadInvoice = {
  readonly accessKey: string
  readonly products: readonly CtePayloadProduct[]
  readonly recipient: CtePayloadParty
  readonly sender: CtePayloadParty
  readonly totalAmount: string
  readonly volumes: readonly CtePayloadVolume[]
}

export type CtePayloadChargeComponent = {
  readonly amount: string
  readonly label: string
}

export type CtePayloadCharge = {
  readonly components: readonly CtePayloadChargeComponent[]
  readonly totalAmount: string
}

export type CtePayloadProfile = {
  readonly cfopInternal: string
  readonly cfopInterstate: string
  readonly icmsBaseReductionRate: string
  readonly icmsCst: CteIcmsCst
  readonly icmsRate: string
  readonly modal: CteModal
  readonly observations: null | string
  readonly operationNature: string
  readonly pickupDetails: string
  readonly pickupIndicator: CtePickupIndicator
  readonly predominantProductMode: CtePredominantProductMode
  readonly predominantProductName: null | string
  readonly receiverIeIndicator: CteReceiverIeIndicator
  readonly serviceType: CteServiceType
  readonly taker: CteTaker
}

export type CtePayloadCarrier = {
  readonly rntrc: string
}

export type BuildCtePayloadParams = {
  readonly carrier: CtePayloadCarrier
  readonly charge: CtePayloadCharge
  readonly invoices: readonly CtePayloadInvoice[]
  readonly profile: CtePayloadProfile
}
