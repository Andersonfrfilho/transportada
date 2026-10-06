/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2 (RF7): "Recomendar viagens" no detalhe da prévia, montado de verdade. Duas visões — os roteiros do
 * contratante como rascunho e a proposta do roteirizador. NADA vira viagem aqui: o rascunho leva ao fluxo de
 * criação que já existe (só com as notas roteáveis) e a proposta usa o diálogo multi-veículo, com o aceite dele.
 * "Faltam N notas — esperando o XML" é o estado normal logo após o envio: tom neutro, nunca alerta. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoPreviewDetailScreen } from '@/modules/cargo-receiving/components/CargoPreviewDetailScreen.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { parseTripCreationDocumentIds } from '@/modules/trip/shared/tripRoute.service'

import { buildPreviewSummary, PREVIEW_ID } from '../fixtures/cargoPreview.fixture'
import {
  buildCounts,
  buildDraftDocument,
  buildDraftRoute,
  buildTripDrafts,
  DEFAULT_TRIP_DRAFTS,
} from '../fixtures/cargoPreviewTripDraft.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { installCargoPreviewDouble, type CargoPreviewDouble } from './cargoPreviewHarness.helper'
import {
  buttonByText,
  click,
  installCargoReceivingDouble,
  maybeButtonByText,
  resetLocation,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { resetTripHookFakes, tripHookFakes } from './tripClientMocks.helper'

const COMPANY_ID = '00000000-0000-4000-8000-000000237c01'
const MANAGER = ['fleet.read', 'trip.manage'] as const
const READER = ['fleet.read'] as const
const VEHICLE = {
  brand: 'Fictícia',
  id: '00000000-0000-4000-8000-000000237d01',
  model: 'Cavalo',
  plate: 'ABC1D23',
  role: 'traction',
  status: 'active',
} as unknown as FleetVehicleDetail

type MountOptions = {
  readonly double?: Partial<CargoPreviewDouble>
  readonly permissions?: readonly string[]
  readonly search?: string
}

async function mountDetail(options: MountOptions = {}) {
  const permissions = options.permissions ?? MANAGER
  resetLocation(`/recebimento/previas/${PREVIEW_ID}${options.search ?? ''}`)
  resetTripHookFakes([])
  tripHookFakes.fleetVehicles = [VEHICLE]
  installCargoReceivingDouble()
  const double = installCargoPreviewDouble(options.double)
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewDetailScreen, {
      canManage: permissions.includes('trip.manage'),
      companyId: COMPANY_ID,
      permissions,
      previewId: PREVIEW_ID,
    }),
  )
  await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBeGreaterThan(0))
  return { double, rendered }
}

async function openRecommendation(options: MountOptions = {}) {
  const mounted = await mountDetail(options)
  await click(buttonByText('Recomendar viagens'))
  await waitFor(() =>
    expect(document.querySelectorAll('[data-trip-draft-route]').length).toBeGreaterThan(0),
  )
  return mounted
}

const card = (routeName: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-trip-draft-route="${routeName}"]`)
  if (found === null) throw new Error(`CARD_NOT_FOUND:${routeName}`)
  return found
}
const routeNames = () =>
  [...document.querySelectorAll('[data-trip-draft-route]')].map((entry) =>
    entry.getAttribute('data-trip-draft-route'),
  )
const solver = () => document.querySelector('[data-trip-draft-solver]') as HTMLElement
const parameters = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('abrir a recomendação (spec 237 T5.2)', () => {
  test('antes do clique nada é lido; depois, uma leitura, e a URL guarda que está aberta', async () => {
    const { double, rendered } = await mountDetail()

    expect(double.calls.getTripDrafts).toEqual([])
    expect(document.querySelector('[data-trip-drafts]')).toBeNull()

    await click(buttonByText('Recomendar viagens'))
    await waitFor(() => expect(document.querySelectorAll('[data-trip-draft-route]').length).toBe(5))

    expect(double.calls.getTripDrafts).toEqual([PREVIEW_ID])
    expect(parameters().get('recommend')).toBe('1')
    expect(document.querySelector('[data-trip-draft-solver]')).not.toBeNull()
    rendered.unmount()
  })

  test('um cartão por roteiro, na ordem da API, e o grupo "sem roteiro" por último', async () => {
    const { rendered } = await openRecommendation()

    expect(routeNames()).toEqual(['FR.FRANC', 'FR.MATAO', 'FR.R.PRE', 'FR.S.CAR', ''])
    expect(card('').textContent).toContain('Sem roteiro')
    rendered.unmount()
  })

  test('o cartão mostra carga, notas vinculadas × linhas, cidades com contagem, peso e valor', async () => {
    const { rendered } = await openRecommendation()
    const text = card('FR.S.CAR').textContent ?? ''

    expect(text).toContain('Carga CARGA-9001')
    expect(text).toContain('4 de 7 linhas vinculadas')
    expect(text).toContain('3 notas vinculadas')
    expect(text).toContain('Araraquara')
    expect(text).toContain('São Carlos')
    expect(text).toContain('2 notas')
    expect(text).toContain('+2 esperando')
    expect(text).toContain('700,5 kg')
    expect(text).toContain('R$ 9.100,50')
    expect(text).toContain('1,3 m³')
    expect(text).toContain('Dia planejado: 05/10/2026')
    expect(card('FR.FRANC').textContent).toContain('Carga ainda não pareada')
    rendered.unmount()
  })

  test('a recomendação fecha e limpa a URL, sem perder os filtros do detalhe', async () => {
    const { rendered } = await openRecommendation({ search: '?state=matched' })

    await click(buttonByText('Fechar a recomendação'))

    expect(document.querySelector('[data-trip-drafts]')).toBeNull()
    expect(parameters().has('recommend')).toBe(false)
    expect(parameters().get('state')).toBe('matched')
    rendered.unmount()
  })

  test('a URL reabre a recomendação com o roteiro escolhido', async () => {
    const { double, rendered } = await mountDetail({ search: '?recommend=1&draftRoute=FR.R.PRE' })

    await waitFor(() => expect(document.querySelectorAll('[data-trip-draft-route]').length).toBe(5))

    expect(double.calls.getTripDrafts).toEqual([PREVIEW_ID])
    expect(card('FR.R.PRE').querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(solver().textContent).toContain('Roteiro FR.R.PRE: 2 notas')
    rendered.unmount()
  })
})

describe('"faltam N notas" é informação, não erro', () => {
  test('o texto é neutro: sem `role=alert`, sem tom de alerta, no singular e no plural', async () => {
    const waiting = buildTripDrafts([
      buildDraftRoute('FR.UM', { counts: buildCounts({ awaiting_xml: 1 }), missingCount: 1 }),
      buildDraftRoute('FR.QUATRO', { counts: buildCounts({ awaiting_xml: 4 }), missingCount: 4 }),
    ])
    const { rendered } = await openRecommendation({ double: { tripDrafts: waiting } })

    const four = card('FR.QUATRO').querySelector('[data-trip-draft-missing]') as HTMLElement
    const one = card('FR.UM').querySelector('[data-trip-draft-missing]') as HTMLElement

    expect(four.textContent).toBe('Faltam 4 notas — esperando o XML')
    expect(one.textContent).toBe('Falta 1 nota — esperando o XML')
    for (const element of [four, one]) {
      expect(element.getAttribute('data-tone')).toBe('neutral')
      expect(element.closest('[role="alert"]')).toBeNull()
      expect(element.getAttribute('role')).toBeNull()
    }
    expect(document.querySelectorAll('[role="alert"]').length).toBe(0)
    rendered.unmount()
  })

  test('roteiro sem linha esperando não mostra a frase', async () => {
    const { rendered } = await openRecommendation()

    expect(card('FR.R.PRE').querySelector('[data-trip-draft-missing]')).toBeNull()
    expect(card('FR.FRANC').querySelector('[data-trip-draft-missing]')?.textContent).toBe(
      'Faltam 4 notas — esperando o XML',
    )
    rendered.unmount()
  })
})

describe('"Montar viagem com estas notas" leva ao fluxo que já existe', () => {
  test('manda SÓ as notas roteáveis do roteiro, por navegação — nenhuma viagem nasce aqui', async () => {
    const { double, rendered } = await openRecommendation()

    await click(buttonByText('Montar viagem com estas notas', card('FR.S.CAR')))

    expect(window.location.pathname).toBe('/trips')
    expect(parseTripCreationDocumentIds(window.location.search)).toEqual([
      documentIdOf(53_001),
      documentIdOf(53_002),
    ])
    expect(window.location.search).not.toContain(documentIdOf(53_003))
    expect(tripHookFakes.multiVehicleRequests).toEqual([])
    expect(double.calls.itemAction).toEqual([])
    rendered.unmount()
  })

  test('sem nota vinculada o botão é desabilitado, com o motivo escrito e ligado a ele', async () => {
    const { rendered } = await openRecommendation()
    const button = buttonByText('Montar viagem com estas notas', card('FR.FRANC'))
    const reason = card('FR.FRANC').querySelector('[data-trip-draft-reason]') as HTMLElement

    expect(button.disabled).toBe(true)
    expect(reason.textContent).toContain('Nenhuma nota vinculada ainda')
    expect(button.getAttribute('aria-describedby')).toBe(reason.id)
    expect(reason.id).not.toBe('')

    const before = window.location.pathname
    await click(button)
    expect(window.location.pathname).toBe(before)
    rendered.unmount()
  })

  test('as notas vinculadas estarem em viagem viva é outro motivo, também escrito', async () => {
    const { rendered } = await openRecommendation()

    const button = buttonByText('Montar viagem com estas notas', card('FR.MATAO'))

    expect(button.disabled).toBe(true)
    expect(card('FR.MATAO').querySelector('[data-trip-draft-reason]')?.textContent).toContain(
      'já estão em viagem',
    )
    expect(card('FR.MATAO').textContent).toContain('1 nota já está em viagem')
    rendered.unmount()
  })

  test('o grupo "sem roteiro" não oferece viagem', async () => {
    const { rendered } = await openRecommendation()

    expect(maybeButtonByText('Montar viagem com estas notas', card(''))?.disabled).toBe(true)
    rendered.unmount()
  })
})

describe('"Gerar proposta" usa o diálogo do roteirizador', () => {
  async function requestProposal(): Promise<void> {
    await click(buttonByText('Gerar proposta'))
    await click(
      document.querySelector('button[aria-label="Veículos disponíveis"]') as HTMLButtonElement,
    )
    await waitFor(() => expect(document.querySelectorAll('[role="option"]').length).toBe(1))
    await click(document.querySelector('[role="option"]') as HTMLElement)
    await click(buttonByText('Distribuir'))
  }

  test('com todos os roteiros, o roteirizador recebe só as notas roteáveis de todos', async () => {
    const { rendered } = await openRecommendation()
    expect(solver().textContent).toContain('Todos os roteiros: 4 notas')

    await requestProposal()

    expect(tripHookFakes.multiVehicleRequests).toHaveLength(1)
    expect(tripHookFakes.multiVehicleRequests[0]?.nfeDocumentIds).toEqual(
      DEFAULT_TRIP_DRAFTS.routableDocumentIds,
    )
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('4 notas selecionadas')
    rendered.unmount()
  })

  test('nunca manda nota em viagem viva, sugerida nem linha esperando o XML', async () => {
    const { rendered } = await openRecommendation()
    await requestProposal()

    const sent = tripHookFakes.multiVehicleRequests[0]?.nfeDocumentIds ?? []

    expect(sent).not.toContain(documentIdOf(53_003))
    expect(sent).not.toContain(documentIdOf(53_010))
    expect(sent.every((id) => DEFAULT_TRIP_DRAFTS.routableDocumentIds.includes(id))).toBe(true)
    rendered.unmount()
  })

  test('com um roteiro escolhido, só as notas dele — e a escolha vai à URL e volta', async () => {
    const { rendered } = await openRecommendation()

    await click(buttonByText('Usar só este roteiro na proposta', card('FR.R.PRE')))

    expect(parameters().get('draftRoute')).toBe('FR.R.PRE')
    expect(solver().textContent).toContain('Roteiro FR.R.PRE: 2 notas')
    await requestProposal()
    expect(tripHookFakes.multiVehicleRequests[0]?.nfeDocumentIds).toEqual([
      documentIdOf(53_020),
      documentIdOf(53_021),
    ])

    await click(
      document.querySelector('[role="dialog"] button[aria-label="Fechar"]') as HTMLButtonElement,
    )
    await click(buttonByText('Usar todos os roteiros'))
    expect(parameters().has('draftRoute')).toBe(false)
    expect(solver().textContent).toContain('Todos os roteiros: 4 notas')
    rendered.unmount()
  })

  test('sem nota roteável não há botão que abra: a razão aparece no lugar', async () => {
    const stuck = buildTripDrafts([
      buildDraftRoute('FR.PRESA', {
        documents: [buildDraftDocument(1, { isInLiveTrip: true, isRoutable: false })],
      }),
    ])
    const { rendered } = await openRecommendation({ double: { tripDrafts: stuck } })

    expect(buttonByText('Gerar proposta').disabled).toBe(true)
    expect(solver().textContent).toContain('Nenhuma nota pode ir ao roteirizador agora')
    rendered.unmount()
  })

  test('acima do teto do roteirizador, a proposta pede um roteiro em vez de falhar na API', async () => {
    const documents = Array.from({ length: 501 }, (_, index) => buildDraftDocument(70_000 + index))
    const huge = buildTripDrafts([
      buildDraftRoute('FR.GRANDE', { documents }),
      buildDraftRoute('FR.PEQUENO', { documents: [buildDraftDocument(70_900)] }),
    ])
    const { rendered } = await openRecommendation({ double: { tripDrafts: huge } })

    expect(buttonByText('Gerar proposta').disabled).toBe(true)
    expect(solver().textContent).toContain('aceita até 500 notas')

    await click(buttonByText('Usar só este roteiro na proposta', card('FR.PEQUENO')))
    expect(buttonByText('Gerar proposta').disabled).toBe(false)
    rendered.unmount()
  })
})

describe('permissões', () => {
  test('quem só lê vê as duas visões e nenhuma ação que cria viagem', async () => {
    const { rendered } = await openRecommendation({ permissions: READER })

    expect(routeNames()).toHaveLength(5)
    expect(maybeButtonByText('Montar viagem com estas notas')).toBeUndefined()
    expect(maybeButtonByText('Usar só este roteiro na proposta')).toBeUndefined()
    expect(maybeButtonByText('Gerar proposta')).toBeUndefined()
    expect(document.querySelector('[data-trip-drafts]')?.textContent).toContain(
      'montar viagens exige a permissão de viagens',
    )
    rendered.unmount()
  })

  test('"Recomendar viagens" é de quem lê', async () => {
    const { rendered } = await mountDetail({ permissions: READER })

    expect(maybeButtonByText('Recomendar viagens')).toBeDefined()
    rendered.unmount()
  })
})

describe('o que fica de fora', () => {
  test('conta cada motivo e o atalho filtra o detalhe pelo estado', async () => {
    const { rendered } = await openRecommendation()
    const outside = document.querySelector('[data-trip-draft-outside]') as HTMLElement

    expect(outside.textContent).toContain('2 notas já estão em viagem')
    expect(outside.textContent).toContain('6 linhas esperando o XML')
    expect(outside.textContent).toContain('1 linha sugerida esperando o seu aceite')
    expect(outside.textContent).toContain('1 linha ambígua')
    expect(outside.textContent).toContain('1 linha inválida')

    await click(buttonByText('Ver as linhas esperando o XML', outside))

    expect(parameters().get('state')).toBe('awaiting_xml')
    expect(parameters().get('recommend')).toBe('1')
    rendered.unmount()
  })

  test('prévia sem nada fora não mostra o aviso', async () => {
    const clean = buildTripDrafts([
      buildDraftRoute('FR.A', { documents: [buildDraftDocument(1), buildDraftDocument(2)] }),
    ])
    const { rendered } = await openRecommendation({ double: { tripDrafts: clean } })

    expect(document.querySelector('[data-trip-draft-outside]')).toBeNull()
    rendered.unmount()
  })
})

describe('estados da leitura', () => {
  test('prévia ainda sendo lida: sem botão, com a explicação e nada lido', async () => {
    resetLocation(`/recebimento/previas/${PREVIEW_ID}`)
    resetTripHookFakes([])
    installCargoReceivingDouble()
    const double = installCargoPreviewDouble({
      items: [],
      summary: buildPreviewSummary({ status: 'queued' }),
    })
    const rendered = await renderWithQueryClient(
      createElement(CargoPreviewDetailScreen, {
        canManage: true,
        companyId: COMPANY_ID,
        permissions: MANAGER,
        previewId: PREVIEW_ID,
      }),
    )

    await waitFor(() =>
      expect(document.querySelector('[data-trip-drafts-notice]')?.textContent).toContain(
        'A recomendação aparece quando a prévia terminar de ser lida.',
      ),
    )

    expect(maybeButtonByText('Recomendar viagens')).toBeUndefined()
    expect(double.calls.getTripDrafts).toEqual([])
    rendered.unmount()
  })

  test('falha da API diz o motivo e não deixa cartão velho', async () => {
    const { rendered } = await mountDetail({
      double: { tripDraftsFailure: new CargoReceivingRequestError('CARGO_PREVIEW_NOT_READY') },
    })

    await click(buttonByText('Recomendar viagens'))
    await waitFor(() =>
      expect(document.querySelector('[data-trip-drafts] [role="alert"]')).not.toBeNull(),
    )

    expect(document.querySelectorAll('[data-trip-draft-route]').length).toBe(0)
    expect(document.querySelector('[data-trip-drafts] [role="alert"]')?.textContent).toContain(
      'A prévia ainda não foi lida',
    )
    rendered.unmount()
  })
})
