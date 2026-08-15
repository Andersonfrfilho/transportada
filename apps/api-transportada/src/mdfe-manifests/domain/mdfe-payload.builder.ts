/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { formatScaledDecimal, parseScaledDecimal } from '../../shared/decimal.service.js'
import { normalizeRntrc } from '../../shared/rntrc.service.js'

import {
  MdfePayloadEmptySelectionError,
  MdfePayloadMissingCargoNcmError,
  MdfePayloadMissingDriverError,
  MdfePayloadMissingInsuranceEndorsementError,
  MdfePayloadMissingInsuranceResponsibleError,
  MdfePayloadMissingLoadingCityError,
  MdfePayloadMissingOwnerError,
  MdfePayloadMissingRntrcError,
  MdfePayloadMissingWheelTypeError,
  MdfePayloadTotalsMismatchError,
} from './mdfe-payload.error.js'
import type {
  BuildMdfePayloadParams,
  MdfeManifestPayload,
  MdfePayloadBankDetails,
  MdfePayloadCondutor,
  MdfePayloadDischargeCity,
  MdfePayloadDocument,
  MdfePayloadOwner,
  MdfePayloadTractionVehicle,
  MdfePayloadVehicle,
} from './mdfe-payload.types.js'

const ERROR_CODE_PREFIX = 'MDFE_PAYLOAD'
const CARGO_VALUE_SCALE = 2n
const CARGO_WEIGHT_SCALE = 4n
const CNPJ_LENGTH = 14
const HIRED_CARRIER = '1'

/** respSeg 1 — a apólice é da própria transportadora emitente. */
const EMITTER_RESPONSIBLE = '1'

/** tpComp 99 (outros) com xComp é como o valor do frete entra no Comp do infPag. */
const OTHER_COMPONENT = '99'
const FREIGHT_COMPONENT_LABEL = 'FRETE'
const CASH_PAYMENT = '0'

/** dhIniViagem viaja no horário de Brasília, que não observa horário de verão desde 2019. */
const BRASILIA_OFFSET = '-03:00'
const BRASILIA_OFFSET_MILLISECONDS = 3 * 60 * 60 * 1000

export function buildMdfePayload({
  companyDefaults,
  documents,
  drivers,
  emitterTaxId,
  loadingCities,
  manifest,
  vehicle,
}: BuildMdfePayloadParams): MdfeManifestPayload {
  if (documents.length === 0) throw new MdfePayloadEmptySelectionError()
  if (loadingCities.length === 0) throw new MdfePayloadMissingLoadingCityError()
  if (drivers.length === 0) throw new MdfePayloadMissingDriverError()
  if (manifest.emitterType === HIRED_CARRIER && manifest.rntrc.length === 0) {
    throw new MdfePayloadMissingRntrcError()
  }

  assertFrozenTotals({ documents, manifest })

  const condutores: readonly MdfePayloadCondutor[] = drivers.map((driver) => ({
    cpf: driver.taxId,
    nome: driver.name,
  }))

  return {
    municipiosCarregamento: loadingCities.map((city) => ({ codigo: city.code, nome: city.name })),
    municipiosDescarga: groupDischargeCities(documents),
    tipoEmitente: manifest.emitterType,
    totais: {
      cUnid: manifest.cargoUnit,
      qCarga: toNumber(manifest.cargoWeight, CARGO_WEIGHT_SCALE),
      vCarga: toNumber(manifest.cargoValue, CARGO_VALUE_SCALE),
    },
    ufFim: manifest.destinationState,
    ufInicio: manifest.originState,
    veiculoTracao: buildTractionVehicle(vehicle, condutores),
    ...buildTransporterType({ manifest, vehicle }),
    ...(manifest.rntrc.length > 0 ? { rntrc: manifest.rntrc } : {}),
    ...buildPredominantProduct(manifest),
    ...buildContractors(manifest),
    ...buildPayments({ bank: companyDefaults.bank, manifest }),
    ...buildInsurance({ emitterTaxId, insurance: companyDefaults.insurance, manifest }),
    ...(manifest.tripStartedAt === null
      ? {}
      : { dataInicioViagem: toBrasiliaDateTime(manifest.tripStartedAt) }),
    ...(manifest.additionalInformation.length > 0
      ? { informacoesAdicionais: manifest.additionalInformation }
      : {}),
  }
}

type AssertFrozenTotalsParams = Pick<BuildMdfePayloadParams, 'documents' | 'manifest'>

/** Total congelado no cabeçalho é o que vai no XML — divergir dos itens é bug, não arredondamento. */
function assertFrozenTotals({ documents, manifest }: AssertFrozenTotalsParams): void {
  const value = sumScaled(
    documents.map((document) => document.cargoValue),
    CARGO_VALUE_SCALE,
  )
  const weight = sumScaled(
    documents.map((document) => document.cargoWeight),
    CARGO_WEIGHT_SCALE,
  )

  if (
    value !== parseScaled(manifest.cargoValue, CARGO_VALUE_SCALE) ||
    weight !== parseScaled(manifest.cargoWeight, CARGO_WEIGHT_SCALE)
  ) {
    throw new MdfePayloadTotalsMismatchError()
  }
}

function groupDischargeCities(
  documents: readonly MdfePayloadDocument[],
): readonly MdfePayloadDischargeCity[] {
  const cities = new Map<string, { readonly keys: string[]; readonly name: string }>()

  for (const document of documents) {
    const city = cities.get(document.dischargeCityCode)
    if (city === undefined) {
      cities.set(document.dischargeCityCode, {
        keys: [document.accessKey],
        name: document.dischargeCityName,
      })
      continue
    }
    city.keys.push(document.accessKey)
  }

  return [...cities].map(([codigo, city]) => ({
    chavesCte: city.keys,
    codigo,
    nome: city.name,
  }))
}

function buildTractionVehicle(
  vehicle: MdfePayloadVehicle,
  condutores: readonly MdfePayloadCondutor[],
): MdfePayloadTractionVehicle {
  if (vehicle.wheelType === '') throw new MdfePayloadMissingWheelTypeError(vehicle.plate)

  return {
    condutores,
    placa: vehicle.plate,
    tara: Number(vehicle.tareWeightKg),
    tipoCarroceria: vehicle.bodyType,
    tipoRodado: vehicle.wheelType,
    uf: vehicle.state,
    ...(vehicle.renavam.length > 0 ? { renavam: vehicle.renavam } : {}),
    ...(vehicle.capacityKg > 0n ? { capacidadeKg: Number(vehicle.capacityKg) } : {}),
    ...(vehicle.capacityM3 > 0n ? { capacidadeM3: Number(vehicle.capacityM3) } : {}),
    ...(vehicle.fleetNumber.length > 0 ? { codigoInterno: vehicle.fleetNumber } : {}),
    ...(vehicle.ownership === 'own' ? {} : { proprietario: buildOwner(vehicle) }),
  }
}

/** Rejeição 745: tpTransp só é aceito junto do proprietário do veículo de tração. */
function buildTransporterType(
  params: Pick<BuildMdfePayloadParams, 'manifest' | 'vehicle'>,
): Pick<MdfeManifestPayload, 'tipoTransportador'> | Record<string, never> {
  if (params.manifest.transporterType === '' || params.vehicle.ownership === 'own') return {}

  return { tipoTransportador: params.manifest.transporterType }
}

function buildOwner(vehicle: MdfePayloadVehicle): MdfePayloadOwner {
  if (
    vehicle.ownerTaxId.length === 0 ||
    vehicle.ownerName.length === 0 ||
    vehicle.ownerRntrc.length === 0 ||
    vehicle.ownerTaxRegime === ''
  ) {
    throw new MdfePayloadMissingOwnerError(vehicle.plate)
  }

  return {
    nome: vehicle.ownerName,
    // O <RNTRC> do proprietário tem oito posições: o zero da folha da ANTT fica no cadastro.
    rntrc: normalizeRntrc(vehicle.ownerRntrc),
    tipoProprietario: vehicle.ownerTaxRegime,
    ...(vehicle.ownerTaxId.length === CNPJ_LENGTH
      ? { cnpj: vehicle.ownerTaxId }
      : { cpf: vehicle.ownerTaxId }),
    ...(vehicle.ownerState.length > 0 ? { uf: vehicle.ownerState } : {}),
  }
}

function buildPredominantProduct(
  manifest: BuildMdfePayloadParams['manifest'],
): Pick<MdfeManifestPayload, 'produtoPredominante'> | Record<string, never> {
  if (manifest.cargoType === '' || manifest.cargoProduct.length === 0) return {}

  const isLotacao = manifest.loadingPostalCode.length > 0 && manifest.dischargePostalCode.length > 0
  if (isLotacao && manifest.cargoProductNcm.length === 0) {
    throw new MdfePayloadMissingCargoNcmError()
  }

  return {
    produtoPredominante: {
      descricao: manifest.cargoProduct,
      tipoCarga: manifest.cargoType,
      ...(manifest.cargoProductNcm.length > 0 ? { ncm: manifest.cargoProductNcm } : {}),
      ...(isLotacao
        ? {
            lotacao: {
              cepCarregamento: manifest.loadingPostalCode,
              cepDescarregamento: manifest.dischargePostalCode,
            },
          }
        : {}),
    },
  }
}

/** Contratante do transporte — a SVRS rejeita com 578 quando ele não é identificado no infANTT. */
function buildContractors(
  manifest: BuildMdfePayloadParams['manifest'],
): Pick<MdfeManifestPayload, 'contratantes'> | Record<string, never> {
  if (manifest.contractorTaxId.length === 0) return {}

  return { contratantes: [buildTaxIdField(manifest.contractorTaxId)] }
}

type BuildPaymentsParams = {
  readonly bank: BuildMdfePayloadParams['companyDefaults']['bank']
  readonly manifest: BuildMdfePayloadParams['manifest']
}

/**
 * infPag — a SVRS rejeita com 302 quando a carga é lotação e o pagamento não vem, e o pagador
 * precisa ser um dos contratantes. Parcelamento (indPag 1 + infPrazo) ainda não é modelado.
 */
function buildPayments({
  bank,
  manifest,
}: BuildPaymentsParams): Pick<MdfeManifestPayload, 'pagamentos'> | Record<string, never> {
  if (manifest.contractorTaxId.length === 0) return {}

  const freightValue = toNumber(manifest.freightValue, CARGO_VALUE_SCALE)
  if (freightValue <= 0) return {}

  return {
    pagamentos: [
      {
        componentes: [
          {
            descricao: FREIGHT_COMPONENT_LABEL,
            tipoComponente: OTHER_COMPONENT,
            valor: freightValue,
          },
        ],
        dadosBancarios: buildBankDetails(bank),
        indicadorPagamento: CASH_PAYMENT,
        valorContrato: freightValue,
        ...buildTaxIdField(manifest.contractorTaxId),
        ...(manifest.contractorName.length > 0 ? { nome: manifest.contractorName } : {}),
      },
    ],
  }
}

function buildBankDetails(
  bank: BuildMdfePayloadParams['companyDefaults']['bank'],
): MdfePayloadBankDetails {
  if (bank.pixKey.length > 0) return { pix: bank.pixKey }
  if (bank.bankCode.length > 0 && bank.bankBranch.length > 0) {
    return { codigoAgencia: bank.bankBranch, codigoBanco: bank.bankCode }
  }

  return {}
}

type BuildInsuranceParams = {
  readonly emitterTaxId: BuildMdfePayloadParams['emitterTaxId']
  readonly insurance: BuildMdfePayloadParams['companyDefaults']['insurance']
  readonly manifest: BuildMdfePayloadParams['manifest']
}

/** Seguro da carga — a SVRS rejeita com 698 quando o emitente é prestador de serviço sem ele. */
function buildInsurance({
  emitterTaxId,
  insurance,
  manifest,
}: BuildInsuranceParams): Pick<MdfeManifestPayload, 'seguro'> | Record<string, never> {
  if (
    insurance.responsibility === '' ||
    insurance.insurerName.length === 0 ||
    insurance.policy.length === 0
  ) {
    return {}
  }

  if (manifest.insuranceEndorsement.length === 0) {
    throw new MdfePayloadMissingInsuranceEndorsementError()
  }

  return {
    seguro: {
      apolice: insurance.policy,
      averbacoes: [manifest.insuranceEndorsement],
      responsavel: insurance.responsibility,
      seguradora: {
        nome: insurance.insurerName,
        ...(insurance.insurerTaxId.length > 0 ? buildTaxIdField(insurance.insurerTaxId) : {}),
      },
      ...buildInsuranceResponsible({ emitterTaxId, insurance, manifest }),
    },
  }
}

/** Rejeição 699: no rodoviário o grupo seg só fecha com o documento de quem responde pela apólice. */
function buildInsuranceResponsible({
  emitterTaxId,
  insurance,
  manifest,
}: BuildInsuranceParams):
  | { readonly responsavelCnpj: string }
  | { readonly responsavelCpf: string } {
  const taxId =
    insurance.responsibility === EMITTER_RESPONSIBLE ? emitterTaxId : manifest.contractorTaxId

  if (taxId.length === 0) throw new MdfePayloadMissingInsuranceResponsibleError()

  return taxId.length === CNPJ_LENGTH ? { responsavelCnpj: taxId } : { responsavelCpf: taxId }
}

function buildTaxIdField(taxId: string): { readonly cnpj: string } | { readonly cpf: string } {
  return taxId.length === CNPJ_LENGTH ? { cnpj: taxId } : { cpf: taxId }
}

function toBrasiliaDateTime(value: string): string {
  const local = new Date(Date.parse(value) - BRASILIA_OFFSET_MILLISECONDS)

  return `${local.toISOString().slice(0, 19)}${BRASILIA_OFFSET}`
}

function parseScaled(value: string, scale: bigint): bigint {
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale, value })
}

function sumScaled(values: readonly string[], scale: bigint): bigint {
  return values.reduce((total, value) => total + parseScaled(value, scale), 0n)
}

function toNumber(value: string, scale: bigint): number {
  return Number(formatScaledDecimal(parseScaled(value, scale), scale))
}
