/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 277 T2: os prints da revisão de design da lista de ocorrências (`web.md` §15) — a lista nova
 * (busca, chips de andamento, grupos, colunas de veículo/cliente/carga, botões de copiar), com os
 * filtros avançados abertos e no celular. Fora do smoke da CI, como os prints da 183: o
 * `playwright.config.ts` só roda a lista explícita dele.
 */
import { resolve } from 'node:path'

import { expect, test, type Page, type Route } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockOccurrenceDetailPrintsApi } from './spec-183-prints-smoke.helper'

const PRINTS_DIRECTORY = resolve(
  process.cwd(),
  '../../specs/277-a-lista-de-ocorrencias-tem-busca-rapida/prints',
)
const PHONE = { height: 844, width: 390 } as const
const DESKTOP = { height: 1000, width: 1440 } as const
const PERMISSIONS = ['fleet.read', 'occurrences.resolve'] as const
const CORS_HEADERS = {
  'access-control-allow-headers': '*',
  'access-control-allow-origin': '*',
} as const

type Seed = Readonly<{
  brand: string
  carrier: string
  city: string
  client: string
  clientTaxId: string
  color: string
  contractor: string
  contractorTaxId: string
  driver: string
  invoice: string
  model: string
  plate: string
  state?: 'cancelled' | 'reopened' | 'resolved'
  type: string
  value: string
  volumes: string
  weight: string
  year: number
}>

const SEEDS: readonly Seed[] = [
  {
    brand: 'Volvo',
    carrier: '',
    city: 'Ribeirão Preto',
    client: 'Padaria Pão Dourado Ltda',
    clientTaxId: '45111222000133',
    color: 'branca',
    contractor: 'Distribuidora Alfa',
    contractorTaxId: '12345678000190',
    driver: 'Carlos Menezes',
    invoice: '48213',
    model: 'FH 540',
    plate: 'ABC1D23',
    type: 'Cliente ausente',
    value: '12480.9000',
    volumes: '12',
    weight: '820',
    year: 2022,
  },
  {
    brand: 'Mercedes-Benz',
    carrier: '',
    city: 'Franca',
    client: 'Mercadinho Santa Luzia',
    clientTaxId: '56222333000144',
    color: 'azul_marinho',
    contractor: 'Mercado Bela Vista',
    contractorTaxId: '23456789000101',
    driver: 'João Batista',
    invoice: '48190',
    model: 'Actros 2651',
    plate: 'QWE4F56',
    type: 'Avaria na carga',
    value: '5320.0000',
    volumes: '4',
    weight: '310.5',
    year: 2020,
  },
  {
    brand: 'Iveco',
    carrier: '',
    city: 'Sertãozinho',
    client: 'Casa do Construtor',
    clientTaxId: '67333444000155',
    color: 'prata',
    contractor: 'Grupo Sul Atacado',
    contractorTaxId: '34567890000112',
    driver: 'Marcos Lima',
    invoice: '48177',
    model: 'Daily 35',
    plate: 'RTY7H89',
    state: 'reopened',
    type: 'Falta de item',
    value: '2890.5000',
    volumes: '2',
    weight: '95',
    year: 2023,
  },
  {
    brand: 'Volvo',
    carrier: '',
    city: 'Uberaba',
    client: 'Supermercado Pague Bem',
    clientTaxId: '78444555000166',
    color: 'branca',
    contractor: 'Distribuidora Alfa',
    contractorTaxId: '12345678000190',
    driver: 'Carlos Menezes',
    invoice: '912453',
    model: 'FH 540',
    plate: 'ABC1D23',
    state: 'resolved',
    type: 'Prorrogação do boleto',
    value: '18760.3500',
    volumes: '30',
    weight: '1240',
    year: 2022,
  },
  {
    brand: 'Scania',
    carrier: '',
    city: 'Araraquara',
    client: 'Empório Vila Nova',
    clientTaxId: '89555666000177',
    color: 'cinza',
    contractor: 'Mercado Bela Vista',
    contractorTaxId: '23456789000101',
    driver: 'Paulo Ribeiro',
    invoice: '48101',
    model: 'R 450',
    plate: 'UIO2J34',
    state: 'resolved',
    type: 'Recusa do destinatário',
    value: '7410.0000',
    volumes: '6',
    weight: '460',
    year: 2019,
  },
  {
    brand: 'Scania',
    carrier: '',
    city: 'Barretos',
    client: 'Distribuidora Norte',
    clientTaxId: '23999000000111',
    color: 'cinza',
    contractor: 'Grupo Sul Atacado',
    contractorTaxId: '34567890000112',
    driver: 'Paulo Ribeiro',
    invoice: '47800',
    model: 'R 450',
    plate: 'UIO2J34',
    state: 'cancelled',
    type: 'Falta de item',
    value: '1980.0000',
    volumes: '1',
    weight: '70',
    year: 2019,
  },
]

function toItem(seed: Seed, index: number): Record<string, unknown> {
  const id = `00000000-0000-4000-8000-0000277${String(index).padStart(5, '0')}`
  return {
    actorName: null,
    case: null,
    channel: 'driver_app',
    contractorReply: null,
    conversation: { contractorState: 'none', driverUnreadCount: 0 },
    createdAt: `2026-10-20T${String(14 - index).padStart(2, '0')}:20:00.000Z`,
    description: 'Registro de exemplo para a revisão de design.',
    document: {
      cargo: { grossWeightKg: `${seed.weight}.0000`, volumeCount: `${seed.volumes}.0000` },
      contractor: { contractorId: null, name: seed.contractor, taxId: seed.contractorTaxId },
      destination: {
        city: seed.city,
        label: `Rua Exemplo, 100 - ${seed.city}/SP`,
        origin: 'delivery',
        postalCode: '14000000',
        recipientName: seed.client,
        state: 'SP',
      },
      nfeDocumentId: `nfe-${index}`,
      recipient: { name: seed.client, taxId: seed.clientTaxId },
      totalValue: seed.value,
      tripDocumentId: `trip-document-${index}`,
    },
    driverName: seed.driver,
    hasAttachment: false,
    id,
    invoiceNumber: seed.invoice,
    invoiceSeries: '1',
    missingNotificationTemplate: false,
    notifies: false,
    occurrenceTypeId: `type-${index}`,
    resolution:
      seed.state === undefined
        ? null
        : { actorKind: 'office', at: '2026-10-20T15:00:00.000Z', state: seed.state },
    source: 'document',
    stage: 'delivery',
    stopLabel: `Parada ${index + 1}`,
    tripId: 'trip-277',
    typeName: seed.type,
    vehicle: { brand: seed.brand, color: seed.color, model: seed.model, modelYear: seed.year },
    vehiclePlate: seed.plate,
  }
}

async function open(page: Page): Promise<void> {
  await mockOccurrenceDetailPrintsApi({ page, permissions: PERMISSIONS })
  await page.route(/\/trip-occurrences(?:\?.*)?$/, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    return route.fulfill({
      body: JSON.stringify({ data: SEEDS.map(toItem), pagination: { nextCursor: null } }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
      status: 200,
    })
  })
  await page.route(/\/trip-occurrence-resolution-summary$/, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ headers: CORS_HEADERS, status: 204 })
    }
    return route.fulfill({
      body: JSON.stringify({
        data: [
          { averageSeconds: 9300, resolvedCount: 4, typeName: 'Cliente ausente' },
          { averageSeconds: 2700, resolvedCount: 2, typeName: 'Endereço não localizado' },
          { averageSeconds: 45, resolvedCount: 1, typeName: 'Recusa do destinatário' },
        ],
      }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
      status: 200,
    })
  })
  await loginAsLocalUser(page)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/ocorrencias')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('searchbox', { name: 'Buscar nas ocorrências' })).toBeVisible()
}

test('print: a lista agrupada por andamento, filtros recolhidos', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page)
  await expect(page.getByRole('columnheader', { name: 'Placa / veículo' })).toBeAttached()
  await expect(page.getByRole('columnheader', { name: 'Resolveu em' })).toBeAttached()
  await expect(page.getByRole('heading', { name: 'Resolução média por tipo' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Resolução média por tipo de ocorrência' }),
  ).toContainText('2 h 35 min')
  await page.screenshot({ fullPage: true, path: resolve(PRINTS_DIRECTORY, 'lista-desktop.png') })
})

test('print: filtros avançados abertos', async ({ page }) => {
  await page.setViewportSize(DESKTOP)
  await open(page)
  await page.getByRole('button', { name: /Filtros avançados/ }).click()
  await expect(page.getByRole('group', { name: 'Filtros avançados' })).toBeVisible()
  await page.screenshot({
    fullPage: true,
    path: resolve(PRINTS_DIRECTORY, 'filtros-avancados.png'),
  })
})

test('print: a lista no celular', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await open(page)
  await page.screenshot({ fullPage: true, path: resolve(PRINTS_DIRECTORY, 'lista-celular.png') })
})
