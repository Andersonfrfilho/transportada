/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightRegionInput } from '../freight-regions/application/freight-region.port.js'
import type { FleetVehicleInput } from '../fleet/application/fleet.port.js'

/**
 * O vínculo motorista↔veículo é por **documento**, não por id: o id do motorista nasce no banco, e
 * a constante precisa continuar legível sem consultar nada. O CPF/CNPJ é o mesmo que
 * `isVehicleOwnedByDriver` compara — casar aqui é o que faz o veículo do agregado vir escolhido
 * sozinho quando o operador escolhe o motorista.
 */
export const LOCAL_TRIP_SEED_DRIVER_VEHICLES: Readonly<Record<string, readonly string[]>> = {
  /** Adalberto Rocha — agregado, roda com o veículo da ROCHA TRANSPORTES. */
  '31820947016': ['RTC4H67'],
  /** Eurides Dias Fontes — agregado, roda com o veículo da TRANSPORTES DIAS. */
  '77605412083': ['RTD5J78'],
  /** Cleiton Marques de Sá — agregado sem CNPJ próprio; dirige um veículo da transportadora. */
  '54730218094': ['RTB3G56'],
}

/**
 * A massa da viagem é sintética de propósito. Espelhar staging traria XML fiscal e dado pessoal de
 * terceiro para a máquina de quem desenvolve — que é exatamente o que `deploy/staging-refresh/`
 * recusa fazer fora do perímetro do Railway.
 */
export const LOCAL_TRIP_SEED_VEHICLES: readonly FleetVehicleInput[] = [
  {
    acquisitionAmount: '280000.00',
    annualInsuranceAmount: '9600.00',
    annualVehicleTaxAmount: '4200.00',
    averageConsumption: '2.8000',
    axleCount: 3,
    bodyType: '02',
    brand: 'MERCEDES-BENZ',
    capacityCubicMeters: '42.000',
    capacityKilograms: '12000.000',
    color: 'branca',
    fleetNumber: '1042',
    fuelType: 'diesel-s10',
    model: 'ATEGO 2426',
    modelYear: 2022,
    monthlyInstallmentAmount: '0.00',
    otherCostsPerKilometer: '0.3500',
    owner: null,
    ownership: 'own',
    plate: 'RTA2F45',
    renavam: '00483721095',
    role: 'traction',
    secondaryAverageConsumption: '0.00',
    secondaryFuelType: '',
    state: 'SP',
    tareWeightKilograms: '8400.000',
    vehicleType: 'truck',
  },
  {
    acquisitionAmount: '180000.00',
    annualInsuranceAmount: '7200.00',
    annualVehicleTaxAmount: '3100.00',
    averageConsumption: '4.2000',
    axleCount: 2,
    bodyType: '02',
    brand: 'VOLKSWAGEN',
    capacityCubicMeters: '28.000',
    capacityKilograms: '6500.000',
    color: 'branca',
    fleetNumber: '1043',
    fuelType: 'diesel-s10',
    model: 'DELIVERY 9.170',
    modelYear: 2021,
    monthlyInstallmentAmount: '0.00',
    otherCostsPerKilometer: '0.3000',
    owner: null,
    ownership: 'own',
    plate: 'RTB3G56',
    renavam: '00483721096',
    role: 'traction',
    secondaryAverageConsumption: '0.00',
    secondaryFuelType: '',
    state: 'SP',
    tareWeightKilograms: '4900.000',
    vehicleType: 'toco',
  },
  {
    acquisitionAmount: '180000.00',
    annualInsuranceAmount: '7200.00',
    annualVehicleTaxAmount: '3100.00',
    averageConsumption: '7.5000',
    axleCount: 2,
    bodyType: '02',
    brand: 'IVECO',
    capacityCubicMeters: '16.000',
    capacityKilograms: '3000.000',
    color: 'branca',
    fleetNumber: '1044',
    fuelType: 'diesel-s10',
    model: 'DAILY 35-150',
    modelYear: 2023,
    monthlyInstallmentAmount: '0.00',
    otherCostsPerKilometer: '0.3000',
    owner: {
      name: 'ROCHA TRANSPORTES AGREGADOS LTDA',
      rntrc: '58151044',
      state: 'SP',
      taxId: '19131243000197',
      taxRegime: '1',
    },
    ownership: 'aggregate',
    plate: 'RTC4H67',
    renavam: '00483721097',
    role: 'traction',
    secondaryAverageConsumption: '0.00',
    secondaryFuelType: '',
    state: 'SP',
    tareWeightKilograms: '2600.000',
    vehicleType: 'vuc',
  },
  {
    acquisitionAmount: '180000.00',
    annualInsuranceAmount: '7200.00',
    annualVehicleTaxAmount: '3100.00',
    averageConsumption: '6.0000',
    axleCount: 2,
    bodyType: '02',
    brand: 'MERCEDES-BENZ',
    capacityCubicMeters: '20.000',
    capacityKilograms: '4200.000',
    color: 'branca',
    fleetNumber: '1045',
    fuelType: 'diesel-s10',
    model: 'ACCELO 1016',
    modelYear: 2020,
    monthlyInstallmentAmount: '0.00',
    otherCostsPerKilometer: '0.3000',
    owner: {
      name: 'TRANSPORTES DIAS COOPERADOS LTDA',
      rntrc: '069450123',
      state: 'SP',
      taxId: '45115180000105',
      taxRegime: '0',
    },
    ownership: 'aggregate',
    plate: 'RTD5J78',
    renavam: '00483721098',
    role: 'traction',
    secondaryAverageConsumption: '0.00',
    secondaryFuelType: '',
    state: 'SP',
    tareWeightKilograms: '3400.000',
    vehicleType: 'three_quarter',
  },
]

/**
 * Sem regra de frete a receita prevista é **zero com lacuna** — a conta está certa e não serve para
 * nada. A regra local é uma só, ampla de propósito: percentual do valor da nota, sem filtro de
 * origem nem destino, para que qualquer nota da base tenha preço.
 *
 * ⚠️ Ela é de bancada, não de negócio: 12% é um número redondo para a tela ter o que somar, e não
 * a tabela de nenhuma transportadora. A tabela real entra por `POST /freight-regions/import`.
 *
 * ⚠️ `percentage` é **fração**, não percentual: a fórmula é `valor da nota × percentage`, e o
 * domínio recusa acima de 1. `12` seria 1200% e é recusado com `FREIGHT_PERCENTAGE_OUT_OF_RANGE`.
 */
export const LOCAL_FREIGHT_RULE = {
  description: 'Regra de bancada — percentual do valor da nota, sem recorte de origem ou destino.',
  maximumAmount: null,
  minimumAmount: null,
  name: 'Bancada local',
  percentage: '0.120000',
  priority: '1',
  validFrom: '2020-01-01',
  validUntil: null,
} as const

/**
 * A tabela de custo por região, **de bancada**. Sem ela o custo do agregado é zero com lacuna, e a
 * conta da viagem só sabe responder receita.
 *
 * ⚠️ Isto **não** é a tabela de nenhuma transportadora, e não pretende ser: a do cliente entra por
 * `POST /freight-regions/import`, com o arquivo que ele exporta (ADR-0038, e o produto é genérico
 * pela ADR-0021). O que está aqui é geografia pública da área das notas de teste com preço redondo,
 * escolhido para a tela ter o que somar.
 *
 * O código carrega a zona: `parseRegionCode` lê a família antes do ponto e a zona depois, e a
 * cobertura é acumulativa dentro da família — quem cobre a zona 2 cobre a 1.
 */
export const LOCAL_FREIGHT_REGIONS: readonly FreightRegionInput[] = [
  {
    cities: [
      { city: 'RIBEIRAO PRETO', state: 'SP' },
      { city: 'SERTAOZINHO', state: 'SP' },
      { city: 'JARDINOPOLIS', state: 'SP' },
    ],
    code: '1.001',
    name: 'Ribeirão e entorno',
    rates: [
      { driverAmount: '180.0000', freightClass: 'utility' },
      { driverAmount: '220.0000', freightClass: 'van' },
      { driverAmount: '260.0000', freightClass: 'vuc' },
      { driverAmount: '310.0000', freightClass: 'three_quarter' },
      { driverAmount: '380.0000', freightClass: 'toco' },
      { driverAmount: '450.0000', freightClass: 'truck' },
    ],
  },
  {
    cities: [
      { city: 'ARARAQUARA', state: 'SP' },
      { city: 'SAO CARLOS', state: 'SP' },
      { city: 'MOCOCA', state: 'SP' },
      { city: 'PORTO FERREIRA', state: 'SP' },
    ],
    code: '1.002',
    name: 'Araraquara e São Carlos',
    rates: [
      { driverAmount: '260.0000', freightClass: 'utility' },
      { driverAmount: '320.0000', freightClass: 'van' },
      { driverAmount: '380.0000', freightClass: 'vuc' },
      { driverAmount: '450.0000', freightClass: 'three_quarter' },
      { driverAmount: '540.0000', freightClass: 'toco' },
      { driverAmount: '640.0000', freightClass: 'truck' },
    ],
  },
  {
    cities: [
      { city: 'FRANCA', state: 'SP' },
      { city: 'SAO JOAQUIM DA BARRA', state: 'SP' },
      { city: 'BATATAIS', state: 'SP' },
    ],
    code: '1.003',
    name: 'Franca e alta Mogiana',
    rates: [
      { driverAmount: '340.0000', freightClass: 'utility' },
      { driverAmount: '410.0000', freightClass: 'van' },
      { driverAmount: '480.0000', freightClass: 'vuc' },
      { driverAmount: '570.0000', freightClass: 'three_quarter' },
      { driverAmount: '680.0000', freightClass: 'toco' },
      { driverAmount: '800.0000', freightClass: 'truck' },
    ],
  },
]

/**
 * A cobertura do motorista: sem ela a tabela existe e **não alcança ninguém** — o valor do agregado
 * sai de `fleet_driver_regions` cruzado com a classe do veículo, não do destino da nota.
 *
 * A chave é o CPF, como no vínculo de veículo: o id nasce no banco e a constante precisa continuar
 * legível sem consultar nada.
 */
export const LOCAL_FREIGHT_REGION_COVERAGE: Readonly<Record<string, readonly string[]>> = {
  /** Adalberto Rocha — agregado, cobre Ribeirão e Araraquara. */
  '31820947016': ['1.001', '1.002'],
  /** Eurides Dias Fontes — agregado, cobre a Mogiana. */
  '77605412083': ['1.003'],
  /** Cleiton Marques de Sá — agregado sem CNPJ, roda o entorno. */
  '54730218094': ['1.001'],
}
