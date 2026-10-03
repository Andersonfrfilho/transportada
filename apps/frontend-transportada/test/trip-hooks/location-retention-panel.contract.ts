/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 T3.1 (CA10): o painel "Apagar a posição pelo prazo de retenção" **montado de verdade** —
 * o que vale é o DOM renderizado, nunca texto de fonte. Dados sintéticos; nenhuma coordenada aqui.
 */
import { act } from 'react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test'

import { DEFAULT_SETTINGS, locationRetentionFakes } from './locationRetentionClientMocks.helper'
import { renderWithQueryClient, settle, waitFor, type RenderedComponent } from './renderHook.helper'

import '../../src/modules/shared/i18n/i18n.service'
import { TripLocationRetentionPanel } from '../../src/modules/trip/components/TripLocationRetentionPanel.component'
import type {
  LocationRetentionImpact,
  LocationRetentionSettings,
} from '../../src/modules/trip/shared/locationRetention.validation'

const NOW = new Date('2026-10-03T15:00:00.000Z')
const DAY_MS = 86_400_000
const ENABLED_SETTINGS: LocationRetentionSettings = {
  origin: 'company',
  purgeEffectiveAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
  purgeEnabled: true,
  retentionDays: 60,
  updatedAt: NOW.toISOString(),
}

let rendered: RenderedComponent | undefined

function impactOf(counts: readonly [number, number, number, number, number], capped = false) {
  const kinds = [
    'stop_event',
    'delivery_proof',
    'status_event',
    'stop_occurrence',
    'document_occurrence',
  ] as const
  return {
    byTable: kinds.map((kind, index) => ({ capped, count: counts[index] ?? 0, kind })),
  } satisfies LocationRetentionImpact
}

async function mountPanel(canManage = true): Promise<void> {
  rendered = await renderWithQueryClient(
    createElement(TripLocationRetentionPanel, { canManage, isEnabled: true }),
  )
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${label}`)
  return found
}

function hasButton(label: string): boolean {
  return [...document.querySelectorAll('button')].some(
    (candidate) => candidate.textContent?.trim() === label,
  )
}

function daysField(): HTMLInputElement {
  const field = document.querySelector<HTMLInputElement>('input[type="number"]')
  if (field === null) throw new Error('DAYS_FIELD_NOT_FOUND')
  return field
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click()
    await Promise.resolve()
  })
  await settle()
}

async function typeDays(value: string): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(daysField(), value)
    daysField().dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function savedCalls(): readonly string[] {
  return locationRetentionFakes.calls.filter((call) => call.startsWith('save:'))
}

describe('painel da retenção da posição (spec 239 T3.1)', () => {
  beforeEach(() => {
    setSystemTime(NOW)
    locationRetentionFakes.calls = []
    locationRetentionFakes.get = () => Promise.resolve(DEFAULT_SETTINGS)
    locationRetentionFakes.save = () => Promise.resolve(DEFAULT_SETTINGS)
    locationRetentionFakes.clear = () => Promise.resolve()
    locationRetentionFakes.impact = () => Promise.resolve(impactOf([0, 0, 0, 0, 0]))
  })

  afterEach(async () => {
    rendered?.unmount()
    rendered = undefined
    setSystemTime()
    await settle()
  })

  it('carregando: esqueleto na forma do painel, sem botão de ação', async () => {
    locationRetentionFakes.get = () => new Promise(() => undefined)
    await mountPanel()

    const skeleton = document.querySelector('[role="status"][aria-busy="true"]')
    expect(skeleton?.getAttribute('aria-label')).toBe('Carregando o prazo de retenção')
    expect(skeleton?.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
    expect(hasButton('Ligar o apagamento')).toBe(false)
  })

  it('erro de leitura: avisa e não oferece gravar', async () => {
    locationRetentionFakes.get = () => Promise.reject(new Error('LOCATION_RETENTION_NETWORK_ERROR'))
    await mountPanel()

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Não foi possível ler o prazo de retenção da posição.',
    )
    expect(hasButton('Ligar o apagamento')).toBe(false)
    expect(document.querySelector('input')).toBe(null)
  })

  it('padrão: desligado, 90 dias, sem "voltar ao padrão" e sem prazo para salvar', async () => {
    await mountPanel()

    expect(text()).toContain('Desligado: nenhuma posição é apagada.')
    expect(daysField().value).toBe('90')
    expect(hasButton('Ligar o apagamento')).toBe(true)
    expect(hasButton('Voltar ao padrão')).toBe(false)
    expect(button('Salvar prazo').disabled).toBe(true)
    expect(text()).toContain('O rastro ao vivo da viagem é apagado em 36 horas')
    expect(text()).toContain('As mensagens do WhatsApp seguem regra própria.')
    expect(text()).toContain('LGPD, art. 5º, I')
  })

  it('ligado: diz o prazo, oferece desligar e voltar ao padrão, sem "começa a valer"', async () => {
    locationRetentionFakes.get = () => Promise.resolve(ENABLED_SETTINGS)
    await mountPanel()

    expect(text()).toContain('Ligado: a posição é apagada depois de 60 dias.')
    expect(daysField().value).toBe('60')
    expect(hasButton('Desligar o apagamento')).toBe(true)
    expect(hasButton('Voltar ao padrão')).toBe(true)
    expect(text()).not.toContain('Começa a valer em')
  })

  it('em carência: mostra "começa a valer em DD/MM HH:mm" e não diz que já apaga', async () => {
    const effective = new Date(NOW.getTime() + DAY_MS)
    locationRetentionFakes.get = () =>
      Promise.resolve({ ...ENABLED_SETTINGS, purgeEffectiveAt: effective.toISOString() })
    await mountPanel()

    const two = (value: number) => String(value).padStart(2, '0')
    const moment = `${two(effective.getDate())}/${two(effective.getMonth() + 1)} ${two(effective.getHours())}:${two(effective.getMinutes())}`
    expect(text()).toContain(`Começa a valer em ${moment}`)
    expect(text()).toContain('aguardando a carência de 24 horas: nada é apagado ainda.')
    expect(text()).not.toContain('Ligado: a posição é apagada depois de')
  })

  it('salvando: o painel avisa e trava as ações até a resposta', async () => {
    locationRetentionFakes.get = () => Promise.resolve(ENABLED_SETTINGS)
    let finish: (settings: LocationRetentionSettings) => void = () => undefined
    locationRetentionFakes.save = () => new Promise((resolve) => (finish = resolve))
    await mountPanel()

    await typeDays('90')
    await click(button('Salvar prazo'))
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Gravando')
    expect(button('Salvar prazo').disabled).toBe(true)
    expect(button('Desligar o apagamento').disabled).toBe(true)
    expect(daysField().disabled).toBe(true)

    await act(async () => {
      finish({ ...ENABLED_SETTINGS, retentionDays: 90 })
      await Promise.resolve()
    })
    await waitFor(() => expect(document.querySelector('[role="status"]')).toBe(null))
  })

  it('sem settings.manage: nem pede ao servidor, mostra o aviso e nenhum controle', async () => {
    await mountPanel(false)

    expect(locationRetentionFakes.calls).toEqual([])
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Somente quem administra as configurações da empresa vê e altera este prazo.',
    )
    expect(document.querySelector('input')).toBe(null)
    expect(document.querySelectorAll('button')).toHaveLength(0)
  })

  it('prazo fora de 30–90 recusa na tela e trava ligar e salvar', async () => {
    await mountPanel()

    for (const typed of ['29', '91', '', '45.5']) {
      await typeDays(typed)
      expect(daysField().getAttribute('aria-invalid')).toBe('true')
      expect(button('Ligar o apagamento').disabled).toBe(true)
      expect(button('Salvar prazo').disabled).toBe(true)
    }
    await typeDays('29')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Informe um número inteiro de 30 a 90.',
    )
    await typeDays('45')
    expect(daysField().getAttribute('aria-invalid')).toBe('false')
    expect(button('Ligar o apagamento').disabled).toBe(false)
  })

  describe('a confirmação (RF9, D5)', () => {
    it('ligar abre o diálogo, só conta ao abrir e só grava depois do botão com o número', async () => {
      locationRetentionFakes.impact = () => Promise.resolve(impactOf([1000, 200, 30, 4, 0]))
      await mountPanel()
      expect(locationRetentionFakes.calls).toEqual(['get'])

      await typeDays('45')
      await click(button('Ligar o apagamento'))

      expect(dialog()).not.toBe(null)
      expect(savedCalls()).toEqual([])
      expect(locationRetentionFakes.calls).toContain('impact:45')
      const dialogText = dialog()?.textContent ?? ''
      expect(dialogText).toContain('Ligar o apagamento da posição?')
      expect(dialogText).toContain('LGPD, art. 5º, I')
      expect(dialogText).toContain('Apagar é definitivo')
      expect(dialogText).toContain('Com o prazo de 45 dias')
      expect(dialogText).toContain('24 horas depois da confirmação')
      expect(dialogText).toContain('Chegadas e entregas')
      expect(dialogText).toContain('1.000')
      expect(dialogText).toContain('Ocorrências')

      await click(button('Ligar e apagar 1.234 pontos'))
      expect(savedCalls()).toEqual(['save:{"purgeEnabled":true,"retentionDays":45}'])
      await waitFor(() => expect(dialog()).toBe(null))
    })

    it('o botão destrutivo espera a contagem e nunca vira "OK"', async () => {
      let finish: (impact: LocationRetentionImpact) => void = () => undefined
      locationRetentionFakes.impact = () => new Promise((resolve) => (finish = resolve))
      await mountPanel()

      await click(button('Ligar o apagamento'))
      expect(button('Ligar e apagar…').disabled).toBe(true)
      expect(dialog()?.querySelector('[role="status"][aria-busy="true"]')).not.toBe(null)

      await act(async () => {
        finish(impactOf([1, 0, 0, 0, 0]))
        await Promise.resolve()
      })
      await waitFor(() => expect(button('Ligar e apagar 1 ponto').disabled).toBe(false))
      expect(hasButton('OK')).toBe(false)
    })

    it('acima do teto a contagem diz "mais de 100 mil"', async () => {
      locationRetentionFakes.impact = () =>
        Promise.resolve(impactOf([100_000, 100_000, 0, 0, 0], true))
      await mountPanel()

      await click(button('Ligar o apagamento'))
      expect(hasButton('Ligar e apagar mais de 100 mil pontos')).toBe(true)
      expect(dialog()?.textContent).toContain('mais de 100 mil')
    })

    it('contagem que falha não deixa confirmar às cegas', async () => {
      locationRetentionFakes.impact = () =>
        Promise.reject(new Error('LOCATION_RETENTION_NETWORK_ERROR'))
      await mountPanel()

      await click(button('Ligar o apagamento'))
      await waitFor(() =>
        expect(dialog()?.querySelector('[role="alert"]')?.textContent).toBe(
          'Não foi possível contar o que seria apagado. Feche e tente de novo.',
        ),
      )
      expect(button('Ligar e apagar…').disabled).toBe(true)
    })

    it('cancelar fecha sem gravar', async () => {
      await mountPanel()
      await click(button('Ligar o apagamento'))
      await click(button('Cancelar'))

      expect(dialog()).toBe(null)
      expect(savedCalls()).toEqual([])
    })

    it('encurtar o prazo com o expurgo ligado confirma, com a contagem do prazo novo', async () => {
      locationRetentionFakes.get = () => Promise.resolve({ ...ENABLED_SETTINGS, retentionDays: 90 })
      locationRetentionFakes.impact = () => Promise.resolve(impactOf([5, 0, 0, 0, 0]))
      await mountPanel()

      await typeDays('30')
      await click(button('Salvar prazo'))

      expect(dialog()?.textContent).toContain('Encurtar o prazo de retenção?')
      expect(locationRetentionFakes.calls).toContain('impact:30')
      expect(savedCalls()).toEqual([])
      await click(button('Encurtar e apagar 5 pontos'))
      expect(savedCalls()).toEqual(['save:{"purgeEnabled":true,"retentionDays":30}'])
    })

    it('alongar o prazo salva direto: sem diálogo e sem contagem', async () => {
      locationRetentionFakes.get = () => Promise.resolve({ ...ENABLED_SETTINGS, retentionDays: 30 })
      await mountPanel()

      await typeDays('90')
      await click(button('Salvar prazo'))

      expect(dialog()).toBe(null)
      expect(locationRetentionFakes.calls.some((call) => call.startsWith('impact:'))).toBe(false)
      expect(savedCalls()).toEqual(['save:{"purgeEnabled":true,"retentionDays":90}'])
    })

    it('desligar salva direto: sem diálogo e sem contagem', async () => {
      locationRetentionFakes.get = () => Promise.resolve(ENABLED_SETTINGS)
      await mountPanel()

      await click(button('Desligar o apagamento'))

      expect(dialog()).toBe(null)
      expect(locationRetentionFakes.calls.some((call) => call.startsWith('impact:'))).toBe(false)
      expect(savedCalls()).toEqual(['save:{"purgeEnabled":false,"retentionDays":60}'])
    })

    it('salvar o prazo com o expurgo desligado não apaga nada e não confirma', async () => {
      await mountPanel()

      await typeDays('40')
      await click(button('Salvar prazo'))

      expect(dialog()).toBe(null)
      expect(savedCalls()).toEqual(['save:{"purgeEnabled":false,"retentionDays":40}'])
    })

    it('voltar ao padrão é um DELETE direto, sem confirmação', async () => {
      locationRetentionFakes.get = () => Promise.resolve(ENABLED_SETTINGS)
      await mountPanel()

      await click(button('Voltar ao padrão'))

      expect(dialog()).toBe(null)
      expect(locationRetentionFakes.calls).toContain('clear')
    })
  })
})
