/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os dados da viagem do motorista da bancada local. Inventados de propósito, como o resto da bancada:
 * nenhum CNPJ, nome ou endereço é de terceiro. A forma espelha a viagem fixa da API de demonstração
 * do app do motorista (3 paradas, 6 notas, uma delas com 3 notas), para os testes de tela e de
 * sinal poderem trocar uma pela outra.
 */

/** Id fixo: é o que a semente apaga e refaz ao rodar de novo. */
export const LOCAL_DRIVER_TRIP_ID = '00000000-0000-4000-8000-0000000d0001'

/** O primeiro veículo da bancada (`local-trip-seed.constant.ts`), que o motorista da viagem usa. */
export const LOCAL_DRIVER_TRIP_VEHICLE_PLATE = 'RTA2F45'

type SeedProduct = {
  readonly code: string
  readonly description: string
  readonly quantity: number
  readonly unitValue: number
}

type SeedStop = {
  readonly city: string
  readonly cityCode: string
  readonly district: string
  readonly latitude: string
  readonly longitude: string
  readonly number: string
  readonly postalCode: string
  readonly street: string
  /** Minutos a partir de agora; 0 = sem janela. */
  readonly windowEndMinutes: number
  readonly windowStartMinutes: number
}

type SeedNote = {
  readonly grossWeight: string
  readonly netWeight: string
  readonly number: string
  readonly products: readonly SeedProduct[]
  readonly recipientName: string
  readonly recipientTaxId: string
  /** A parada (1..n) a que a nota pertence. */
  readonly stop: number
  readonly volumes: number
}

export const LOCAL_DRIVER_TRIP_STOPS: readonly SeedStop[] = [
  {
    city: 'São Paulo',
    cityCode: '3550308',
    district: 'Centro',
    latitude: '-23.5503000',
    longitude: '-46.6340000',
    number: '100',
    postalCode: '01001000',
    street: 'Praça da Sé',
    windowEndMinutes: 120,
    windowStartMinutes: 30,
  },
  {
    city: 'São Paulo',
    cityCode: '3550308',
    district: 'Bela Vista',
    latitude: '-23.5614000',
    longitude: '-46.6559000',
    number: '1500',
    postalCode: '01310100',
    street: 'Av. Paulista',
    windowEndMinutes: 240,
    windowStartMinutes: 90,
  },
  {
    city: 'São Paulo',
    cityCode: '3550308',
    district: 'Vila Mariana',
    latitude: '-23.5894000',
    longitude: '-46.6340000',
    number: '3000',
    postalCode: '04101300',
    street: 'Rua Vergueiro',
    windowEndMinutes: 0,
    windowStartMinutes: 0,
  },
]

export const LOCAL_DRIVER_TRIP_NOTES: readonly SeedNote[] = [
  {
    grossWeight: '12.500',
    netWeight: '11.900',
    number: '900101',
    products: [
      { code: 'CX-CAFE', description: 'Café torrado 500 g', quantity: 30, unitValue: 38.5 },
      { code: 'CX-ACUCAR', description: 'Açúcar refinado 1 kg', quantity: 50, unitValue: 7.0 },
    ],
    recipientName: 'Mercearia do Centro',
    recipientTaxId: '11222333000181',
    stop: 1,
    volumes: 3,
  },
  {
    grossWeight: '8.200',
    netWeight: '7.800',
    number: '900102',
    products: [
      { code: 'CX-PAO', description: 'Pão de forma 500 g', quantity: 41, unitValue: 24.0 },
    ],
    recipientName: 'Padaria Estrela',
    recipientTaxId: '22333444000192',
    stop: 1,
    volumes: 2,
  },
  {
    grossWeight: '20.000',
    netWeight: '19.000',
    number: '900103',
    products: [
      { code: 'CX-REM', description: 'Analgésico 20 comprimidos', quantity: 200, unitValue: 12.0 },
    ],
    recipientName: 'Farmácia Bem Estar',
    recipientTaxId: '33444555000103',
    stop: 2,
    volumes: 5,
  },
  {
    grossWeight: '145.800',
    netWeight: '140.000',
    number: '900104',
    products: [
      { code: 'PL-ARROZ', description: 'Arroz tipo 1 5 kg', quantity: 240, unitValue: 28.4 },
      { code: 'PL-FEIJAO', description: 'Feijão carioca 1 kg', quantity: 300, unitValue: 33.0 },
    ],
    recipientName: 'Supermercado Bom Preço',
    recipientTaxId: '44555666000114',
    stop: 3,
    volumes: 12,
  },
  {
    grossWeight: '33.100',
    netWeight: '31.000',
    number: '900105',
    products: [
      { code: 'FE-PREGO', description: 'Prego 18x27 1 kg', quantity: 120, unitValue: 15.4 },
      { code: 'FE-PARAF', description: 'Parafuso sextavado 100 un', quantity: 90, unitValue: 22.2 },
    ],
    recipientName: 'Loja de Ferragens Silva',
    recipientTaxId: '55666777000125',
    stop: 3,
    volumes: 4,
  },
  {
    grossWeight: '4.000',
    netWeight: '3.700',
    number: '900106',
    products: [
      { code: 'RE-TEMPERO', description: 'Tempero completo 1 kg', quantity: 24, unitValue: 20.0 },
    ],
    recipientName: 'Restaurante Sabor da Casa',
    recipientTaxId: '66777888000136',
    stop: 3,
    volumes: 1,
  },
]
