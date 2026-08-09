/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Modelo do DACTE lido do XML autorizado, não do payload que emitimos: a SEFAZ pode alterar o
 * número do CT-e na autorização, e só o XML devolvido diz o que de fato foi autorizado.
 * Valor monetário viaja como string decimal — float binário perde centavo.
 */

export type DacteEnvironment = 'homologation' | 'production'

export type DacteServiceTakerRole = 'delivery' | 'other' | 'receiver' | 'sender' | 'shipper'

export type DacteLocation = Readonly<{
  city: string
  state: string
}>

export type DacteAddress = Readonly<{
  city: string
  complement?: string
  country?: string
  district: string
  number: string
  state: string
  street: string
  zipCode?: string
}>

export type DacteParty = Readonly<{
  address: DacteAddress
  document: string
  email?: string
  fantasyName?: string
  name: string
  phone?: string
  stateRegistration?: string
}>

export type DacteServiceTaker = Readonly<{
  party: DacteParty
  role: DacteServiceTakerRole
}>

export type DacteServiceComponent = Readonly<{
  name: string
  value: string
}>

export type DacteService = Readonly<{
  components: readonly DacteServiceComponent[]
  receivedAmount?: string
  totalAmount: string
}>

export type DacteCargoQuantity = Readonly<{
  measureType: string
  quantity: string
  unitCode: string
}>

export type DacteCargo = Readonly<{
  insuredAmount?: string
  predominantProduct: string
  quantities: readonly DacteCargoQuantity[]
  totalAmount?: string
}>

export type DacteTax = Readonly<{
  amount?: string
  approximateTaxAmount?: string
  baseAmount?: string
  isSimplesNacional: boolean
  rate?: string
  reductionPercent?: string
  situationCode: string
}>

export type DacteRelatedDocument = Readonly<{
  accessKey: string
  expectedDeliveryDate?: string
}>

export type DacteAuthorization = Readonly<{
  protocol: string
  receivedAt: string
}>

export type DacteDocument = Readonly<{
  accessKey: string
  authorization?: DacteAuthorization
  cargo: DacteCargo
  cfop: string
  deliveryParty?: DacteParty
  destination: DacteLocation
  documentType: string
  emitter: DacteParty
  environment: DacteEnvironment
  issuedAt: string
  modal: string
  model: string
  natureOfOperation: string
  number: string
  observations?: string
  origin: DacteLocation
  printMode: string
  qrCodeUrl?: string
  receiver: DacteParty
  relatedDocuments: readonly DacteRelatedDocument[]
  rntrc?: string
  sender: DacteParty
  series: string
  service: DacteService
  serviceTaker: DacteServiceTaker
  serviceType: string
  shipper?: DacteParty
  tax: DacteTax
}>
