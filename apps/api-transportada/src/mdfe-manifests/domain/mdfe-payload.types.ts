/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FleetVehicleOwnership,
  MdfeBodyType,
  MdfeOwnerTaxRegime,
  MdfeWheelType,
} from '../../database/fleet.schema.js'
import type {
  MdfeCargoType,
  MdfeCargoUnit,
  MdfeEmitterType,
  MdfeInsuranceResponsibility,
  MdfeTransporterType,
} from '../../database/mdfe.schema.js'

export type MdfePayloadDocument = {
  readonly accessKey: string
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly dischargeCityCode: string
  readonly dischargeCityName: string
}

export type MdfePayloadCity = {
  readonly code: string
  readonly name: string
}

export type MdfePayloadDriver = {
  readonly name: string
  readonly taxId: string
}

export type MdfePayloadManifest = {
  readonly additionalInformation: string
  readonly cargoProduct: string
  readonly cargoProductNcm: string
  readonly cargoType: '' | MdfeCargoType
  readonly cargoUnit: MdfeCargoUnit
  readonly cargoValue: string
  readonly cargoWeight: string
  readonly contractorName: string
  readonly contractorTaxId: string
  readonly destinationState: string
  readonly dischargePostalCode: string
  readonly emitterType: MdfeEmitterType
  readonly freightValue: string
  readonly insuranceEndorsement: string
  readonly loadingPostalCode: string
  readonly originState: string
  readonly rntrc: string
  readonly transporterType: '' | MdfeTransporterType
  readonly tripStartedAt: string | null
}

/** Conta em que a transportadora recebe o frete — vale para todo manifesto da empresa. */
export type MdfePayloadBankDefaults = {
  readonly bankBranch: string
  readonly bankCode: string
  readonly pixKey: string
}

/** Apólice da transportadora — a averbação é por viagem e vive no manifesto. */
export type MdfePayloadInsuranceDefaults = {
  readonly insurerName: string
  readonly insurerTaxId: string
  readonly policy: string
  readonly responsibility: '' | MdfeInsuranceResponsibility
}

export type MdfePayloadCompanyDefaults = {
  readonly bank: MdfePayloadBankDefaults
  readonly insurance: MdfePayloadInsuranceDefaults
}

export type MdfePayloadVehicle = {
  readonly bodyType: MdfeBodyType
  readonly capacityKg: bigint
  readonly capacityM3: bigint
  readonly fleetNumber: string
  readonly ownerName: string
  readonly ownerRntrc: string
  readonly ownerState: string
  readonly ownerTaxId: string
  readonly ownerTaxRegime: '' | MdfeOwnerTaxRegime
  readonly ownership: FleetVehicleOwnership
  readonly plate: string
  readonly renavam: string
  readonly state: string
  readonly tareWeightKg: bigint
  readonly wheelType: '' | MdfeWheelType
}

export type BuildMdfePayloadParams = {
  readonly companyDefaults: MdfePayloadCompanyDefaults
  readonly documents: readonly MdfePayloadDocument[]
  readonly drivers: readonly MdfePayloadDriver[]
  /** CNPJ do emitente — responde pelo seguro quando a apólice é da própria transportadora. */
  readonly emitterTaxId: string
  readonly loadingCities: readonly MdfePayloadCity[]
  readonly manifest: MdfePayloadManifest
  readonly vehicle: MdfePayloadVehicle
}

export type MdfePayloadLoadingCity = {
  readonly codigo: string
  readonly nome: string
}

export type MdfePayloadDischargeCity = {
  readonly chavesCte: readonly string[]
  readonly codigo: string
  readonly nome: string
}

export type MdfePayloadCondutor = {
  readonly cpf: string
  readonly nome: string
}

export type MdfePayloadOwner = {
  readonly cnpj?: string
  readonly cpf?: string
  readonly nome: string
  readonly rntrc: string
  readonly tipoProprietario: MdfeOwnerTaxRegime
  readonly uf?: string
}

export type MdfePayloadTractionVehicle = {
  readonly capacidadeKg?: number
  readonly capacidadeM3?: number
  readonly codigoInterno?: string
  readonly condutores: readonly MdfePayloadCondutor[]
  readonly placa: string
  readonly proprietario?: MdfePayloadOwner
  readonly renavam?: string
  readonly tara: number
  readonly tipoCarroceria: MdfeBodyType
  readonly tipoRodado: MdfeWheelType
  readonly uf?: string
}

export type MdfePayloadContratante = {
  readonly cnpj?: string
  readonly cpf?: string
}

/** infBanc aceita conta, instituição de pagamento ou PIX — nunca mais de um. */
export type MdfePayloadBankDetails = {
  readonly codigoAgencia?: string
  readonly codigoBanco?: string
  readonly pix?: string
}

export type MdfePayloadPaymentComponent = {
  readonly descricao?: string
  readonly tipoComponente: string
  readonly valor: number
}

export type MdfePayloadPagamento = {
  readonly cnpj?: string
  readonly componentes: readonly MdfePayloadPaymentComponent[]
  readonly cpf?: string
  readonly dadosBancarios: MdfePayloadBankDetails
  readonly indicadorPagamento: string
  readonly nome?: string
  readonly valorContrato: number
}

export type MdfePayloadSeguradora = {
  readonly cnpj?: string
  readonly cpf?: string
  readonly nome: string
}

export type MdfePayloadSeguro = {
  readonly apolice: string
  readonly averbacoes?: readonly string[]
  readonly responsavel: MdfeInsuranceResponsibility
  readonly responsavelCnpj?: string
  readonly responsavelCpf?: string
  readonly seguradora: MdfePayloadSeguradora
}

/** infLotacao — CEP de origem e destino exigidos quando a carga é lotação. */
export type MdfePayloadLotacao = {
  readonly cepCarregamento: string
  readonly cepDescarregamento: string
}

/**
 * Espelho do contrato `MdfeData` do pacote fiscal — o domínio não importa o vendor, o gateway
 * entrega este objeto ao provider. Nomes e valores são os do layout MDF-e 3.00.
 */
export type MdfeManifestPayload = {
  readonly contratantes?: readonly MdfePayloadContratante[]
  readonly dataInicioViagem?: string
  readonly informacoesAdicionais?: string
  readonly municipiosCarregamento: readonly MdfePayloadLoadingCity[]
  readonly municipiosDescarga: readonly MdfePayloadDischargeCity[]
  readonly pagamentos?: readonly MdfePayloadPagamento[]
  readonly produtoPredominante?: {
    readonly descricao: string
    readonly lotacao?: MdfePayloadLotacao
    readonly ncm?: string
    readonly tipoCarga: MdfeCargoType
  }
  readonly rntrc?: string
  readonly seguro?: MdfePayloadSeguro
  readonly tipoEmitente: MdfeEmitterType
  readonly tipoTransportador?: MdfeTransporterType
  readonly totais: {
    readonly cUnid: MdfeCargoUnit
    readonly qCarga: number
    readonly vCarga: number
  }
  readonly ufFim: string
  readonly ufInicio: string
  readonly veiculoTracao: MdfePayloadTractionVehicle
}
