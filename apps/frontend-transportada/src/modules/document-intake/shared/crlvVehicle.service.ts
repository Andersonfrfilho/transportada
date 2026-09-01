import {
  readCrlv,
  type CrlvRemark as DocumentRemark,
  type PdfPageText,
} from '@adatechnology/document-intake'

import { DEFAULT_FUEL_PRODUCT, type FuelProduct } from '@/modules/shared/fuel.constant'

import {
  VEHICLE_COLOR,
  type FleetVehicleFormState,
  type MdfeBodyType,
  type VehicleColor,
} from '../../fleet/shared/fleet.types'

/**
 * Spec 071: a leitura do CRLV **saiu daqui** e virou `readCrlv`, no `@adatechnology/document-intake`
 * — a landing passou a lê-lo também, e nenhuma app importa código-fonte de outra (ADR-0054). O que
 * ficou é o que só o painel sabe: traduzir o que o documento imprime para o catálogo da frota.
 *
 * A linha entre os dois é quem quebra quando: o Detran mudar o layout quebra o pacote; `MdfeBodyType`,
 * `FuelProduct` ou `VehicleColor` mudarem quebram este arquivo. A landing não ganha cópia de nada
 * disto porque a ficha dela não tem carroceria, combustível nem cor.
 *
 * Spec 048: o CRLV preenche o que ele diz, e **só** o que ele diz. Cada campo que fica em branco
 * fica com o motivo à vista: campo vazio sem explicação vira digitação de novo, e valor inventado
 * vira frete errado.
 */
export type CrlvRemarkReason =
  | 'ambiguousDiesel'
  | 'checkDigitFailed'
  | 'notInCatalog'
  | 'notInformed'
  | 'notPrinted'
  | 'notReadable'

export type CrlvRemark = Readonly<{
  field: string
  reason: CrlvRemarkReason
}>

export type CrlvReading = Readonly<{
  remarks: readonly CrlvRemark[]
  values: Partial<FleetVehicleFormState>
}>

const BODY_TYPE_BY_PRINTED: Readonly<Record<string, MdfeBodyType>> = {
  'CARGA ABERTA': '01',
  ABERTA: '01',
  BAU: '02',
  'CARGA FECHADA': '02',
  FECHADA: '02',
  FURGAO: '02',
  GRANELEIRA: '03',
  'PORTA CONTAINER': '04',
  SIDER: '05',
  'NAO APLICAVEL': '00',
}

/**
 * O CRLV imprime `ALCOOL/GASOLINA` para o flex, e o nosso catálogo não tem "flex": tem produto
 * principal e produto secundário. Álcool primeiro porque é a ordem que o documento imprime.
 */
const FUEL_BY_PRINTED: Readonly<
  Record<string, Readonly<{ primary: FuelProduct; secondary?: FuelProduct }>>
> = {
  'ALCOOL / GASOLINA': { primary: 'etanol-hidratado', secondary: 'gasolina-comum' },
  'ALCOOL/GASOLINA': { primary: 'etanol-hidratado', secondary: 'gasolina-comum' },
  ALCOOL: { primary: 'etanol-hidratado' },
  ELETRICO: { primary: 'eletrico' },
  'GASOLINA / ALCOOL': { primary: 'gasolina-comum', secondary: 'etanol-hidratado' },
  'GASOLINA/ALCOOL': { primary: 'gasolina-comum', secondary: 'etanol-hidratado' },
  GASOLINA: { primary: 'gasolina-comum' },
  'GAS NATURAL': { primary: 'gnv' },
  GNV: { primary: 'gnv' },
}

const DIESEL_PRINTED = 'DIESEL'

type Collector = Readonly<{
  remark: (field: string, reason: CrlvRemarkReason) => void
  values: { -readonly [Field in keyof FleetVehicleFormState]?: FleetVehicleFormState[Field] }
}>

function toVehicleColor(printed: string): VehicleColor | undefined {
  const normalized = printed.toLowerCase().replace(/\s+/gu, '_')

  return VEHICLE_COLOR.find((color) => color === normalized)
}

/**
 * O documento diz `DIESEL` e para por aí — S10 e S500 são o mesmo carimbo para ele. Preencher o
 * padrão da frota é o certo (S10 é o obrigatório desde 2012), mas em silêncio seria escolher o
 * preço do litro pelo operador: o motivo vai junto.
 */
function applyFuel(printed: string, collector: Collector): void {
  if (printed.startsWith(DIESEL_PRINTED)) {
    collector.values.fuelType = DEFAULT_FUEL_PRODUCT
    collector.remark('fuelType', 'ambiguousDiesel')
    return
  }

  const known = FUEL_BY_PRINTED[printed]
  if (known === undefined) {
    collector.remark('fuelType', 'notInCatalog')
    return
  }

  collector.values.fuelType = known.primary
  if (known.secondary !== undefined) collector.values.secondaryFuelType = known.secondary
}

/** O pacote já avisou o que o documento não entregou; aqui só se traduz o que ele entregou. */
export function readCrlvVehicle(page: PdfPageText): CrlvReading {
  const reading = readCrlv(page)
  const remarks: CrlvRemark[] = reading.remarks.map((remark: DocumentRemark) => ({ ...remark }))
  const collector: Collector = {
    remark: (field, reason) => remarks.push({ field, reason }),
    values: {},
  }

  const { values } = reading
  if (values.plate !== undefined) collector.values.plate = values.plate
  if (values.renavam !== undefined) collector.values.renavam = values.renavam
  if (values.state !== undefined) collector.values.state = values.state
  if (values.brand !== undefined) collector.values.brand = values.brand
  if (values.model !== undefined) collector.values.model = values.model
  if (values.modelYear !== undefined) collector.values.modelYear = values.modelYear
  if (values.axleCount !== undefined) collector.values.axleCount = values.axleCount
  if (values.ownerName !== undefined) collector.values.ownerName = values.ownerName
  if (values.ownerTaxId !== undefined) collector.values.ownerTaxId = values.ownerTaxId

  if (values.color !== undefined) {
    const known = toVehicleColor(values.color)
    if (known === undefined) collector.remark('color', 'notInCatalog')
    else collector.values.color = known
  }

  if (values.bodyType !== undefined) {
    const known = BODY_TYPE_BY_PRINTED[values.bodyType]
    if (known === undefined) collector.remark('bodyType', 'notInCatalog')
    else collector.values.bodyType = known
  }

  if (values.fuel !== undefined) applyFuel(values.fuel, collector)

  /** A capacidade não está no CRLV; dizer isso é o que impede o operador de procurá-la ali. */
  collector.remark('capacityKilograms', 'notPrinted')

  return { remarks, values: collector.values }
}
