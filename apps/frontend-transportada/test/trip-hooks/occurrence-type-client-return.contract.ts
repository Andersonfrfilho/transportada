/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T4 (RF2): o bloco "Retorno ao cliente" do tipo — uma caixa por canal (e-mail, WhatsApp; SMS "em breve"), cada
 * um com o modelo do módulo de Notificações e o modo de envio. Procura o que cada controle mostra e o que grava: só o
 * canal que mudou, inteiro. A prévia é a do SDK de Notificações. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'
import { NotificationProvider } from '@adatechnology/notification-ui'
import type { NotificationClient } from '@adatechnology/notification-client'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { ClientChannelTemplateChoice } from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installMailChoiceDouble } from './occurrenceTypeMailHarness.helper'
import type { MailChoiceFakes } from './occurrenceTypeMailHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

function buildChoice(overrides: Partial<ClientChannelTemplateChoice>): ClientChannelTemplateChoice {
  return {
    body: 'Boleto da nota {{numeroNota}} de {{razaoSocial}}',
    channel: 'whatsapp',
    key: 'boleto.prorrogado',
    problems: [],
    subject: null,
    usable: true,
    version: 1,
    ...overrides,
  }
}

const CHOICES: readonly ClientChannelTemplateChoice[] = [
  buildChoice({
    body: 'Olá, segue o boleto da nota {{numeroNota}}.',
    channel: 'email',
    key: 'boleto.prorrogado',
    subject: 'Boleto da nota {{numeroNota}} prorrogado',
  }),
  buildChoice({ channel: 'email', key: 'boleto.novo', subject: 'Novo boleto' }),
  buildChoice({ channel: 'whatsapp', key: 'boleto.prorrogado' }),
  buildChoice({ channel: 'whatsapp', key: 'boleto.curto', body: 'Boleto {{numeroNota}}' }),
  buildChoice({
    channel: 'whatsapp',
    key: 'trip.delivery-occurrence',
    problems: [{ code: 'system_key' }],
    usable: false,
  }),
]

const OFF = { enabled: false, sendMode: 'manual', templateKey: null } as const

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    clientChannel: 'off',
    clientChannels: { email: OFF, whatsapp: OFF },
    clientEmailSendMode: 'manual',
    clientEmailType: 'boleto',
    contractorMailRecipients: [],
    contractorMailWatchers: [],
    contractorNotificationTemplateKey: null,
    contractorScope: 'all',
    contractors: [],
    emailTemplateKey: null,
    emailsContractor: true,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    missingNotificationTemplate: false,
    moments: ['document'],
    name: 'Boleto prorrogado',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function scenario(double: Partial<MailChoiceFakes>, body: () => Promise<void>) {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    installMailChoiceDouble(double)
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
    }
  }
}

async function mount(type: OccurrenceType): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(
        NotificationProvider,
        { client: {} as NotificationClient },
        createElement(OccurrenceTypeRow, {
          canManage: true,
          exceptions: EMPTY_EXCEPTIONS_STATE,
          isSaving: false,
          onSave: (input) => saved.push(input),
          templates: { options: [], status: 'ready' },
          type,
        }),
      ),
    ),
  )
}

function block(): HTMLElement {
  const found = document.querySelector<HTMLElement>('section[aria-label="Retorno ao cliente"]')
  if (found === null) throw new Error('CLIENT_RETURN_BLOCK_NOT_FOUND')
  return found
}

function trigger(label: string): HTMLButtonElement {
  const found = block().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`TRIGGER_NOT_FOUND:${label}`)
  return found
}

function checkbox(label: string): HTMLInputElement {
  const found = [...block().querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  const input = found?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (input === null || input === undefined) throw new Error(`CHECKBOX_NOT_FOUND:${label}`)
  return input
}

function optionTexts(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? '',
  )
}

async function choose(label: string, optionText: string): Promise<void> {
  await waitFor(() => expect(trigger(label).disabled).toBe(false))
  await click(trigger(label))
  await waitFor(() => expect(optionTexts().length).toBeGreaterThan(0))
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
    (candidate.textContent ?? '').includes(optionText),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

function blockText(): string {
  return block().textContent ?? ''
}

describe('o bloco "Retorno ao cliente" do tipo (spec 286 T4, RF2)', () => {
  test(
    'API anterior à matriz: o bloco não existe e a tela antiga mantém o canal e o envio',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      const legacy: Record<string, unknown> = { ...buildType() }
      delete legacy.clientChannels
      await mount(legacy as unknown as OccurrenceType)

      expect(document.querySelector('section[aria-label="Retorno ao cliente"]')).toBeNull()
      expect(document.body.textContent).toContain('Canal com o cliente')
    }),
  )

  test(
    'com a matriz, o canal solto sai da identidade: quem decide são as caixas do bloco',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(buildType())

      expect(document.body.textContent).not.toContain('Canal com o cliente')
      expect(document.body.textContent).not.toContain('Envio do boleto ao cliente')
      expect(block()).not.toBeNull()
    }),
  )

  test(
    'mostra e-mail e WhatsApp como caixas, e o SMS desligado com "Em breve"',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(buildType())

      expect(checkbox('E-mail').checked).toBe(false)
      expect(checkbox('WhatsApp').checked).toBe(false)
      expect(checkbox('SMS').disabled).toBe(true)
      expect(blockText()).toContain('Em breve')
    }),
  )

  test(
    'cada canal lista só os modelos do canal, sem aviso do sistema',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(buildType())
      await waitFor(() => expect(trigger('WhatsApp: Modelo (Notificações)').disabled).toBe(false))

      await click(trigger('WhatsApp: Modelo (Notificações)'))
      await waitFor(() => expect(optionTexts().length).toBeGreaterThan(0))
      expect(optionTexts()).toEqual(['Nenhum', 'boleto.curto', 'boleto.prorrogado'])
      expect(optionTexts().join(' ')).not.toContain('trip.delivery-occurrence')
    }),
  )

  test(
    'marcar o WhatsApp grava só o WhatsApp, inteiro; o e-mail não é mandado',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(buildType())
      await click(checkbox('WhatsApp'))

      expect(saved).toHaveLength(1)
      expect(saved[0]?.clientChannels).toEqual({
        whatsapp: { enabled: true, sendMode: 'manual', templateKey: null },
      })
      expect(saved[0]).not.toHaveProperty('clientChannel')
      expect(saved[0]).not.toHaveProperty('clientEmailSendMode')
    }),
  )

  test(
    'escolher o modelo e o modo grava só o canal da linha, com o resto do canal intacto',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: { enabled: true, sendMode: 'manual', templateKey: 'boleto.novo' },
            whatsapp: { enabled: true, sendMode: 'manual', templateKey: null },
          },
        }),
      )
      await choose('WhatsApp: Modelo (Notificações)', 'boleto.curto')
      expect(saved[0]?.clientChannels).toEqual({
        whatsapp: { enabled: true, sendMode: 'manual', templateKey: 'boleto.curto' },
      })
      saved.length = 0

      await choose('E-mail: Envio', 'Automático')
      expect(saved[0]?.clientChannels).toEqual({
        email: { enabled: true, sendMode: 'automatic', templateKey: 'boleto.novo' },
      })
    }),
  )

  test(
    '"Nenhum" limpa a chave com null',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: OFF,
            whatsapp: { enabled: true, sendMode: 'automatic', templateKey: 'boleto.curto' },
          },
        }),
      )
      await choose('WhatsApp: Modelo (Notificações)', 'Nenhum')

      expect(saved[0]?.clientChannels).toEqual({
        whatsapp: { enabled: true, sendMode: 'automatic', templateKey: null },
      })
    }),
  )

  test(
    'canal marcado sem modelo avisa que não será enviado; desmarcado não avisa',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: OFF,
            whatsapp: { enabled: true, sendMode: 'manual', templateKey: null },
          },
        }),
      )
      expect(blockText()).toContain('WhatsApp marcado, mas o tipo está sem modelo neste canal')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType())
      expect(blockText()).not.toContain('sem modelo neste canal')
    }),
  )

  test(
    'modelo escolhido que deixou de servir fica à vista, com o motivo',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: OFF,
            whatsapp: {
              enabled: true,
              sendMode: 'manual',
              templateKey: 'trip.delivery-occurrence',
            },
          },
        }),
      )

      await waitFor(() => expect(blockText()).toContain('É um aviso do sistema'))
      expect(trigger('WhatsApp: Modelo (Notificações)').textContent).toContain(
        'trip.delivery-occurrence',
      )
    }),
  )

  test(
    'modelo que sumiu do módulo avisa que não existe mais, sem inventar a lista',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: OFF,
            whatsapp: { enabled: true, sendMode: 'manual', templateKey: 'apagado.x' },
          },
        }),
      )

      await waitFor(() => expect(blockText()).toContain('não existe mais no módulo'))
    }),
  )

  test(
    'e-mail com o tipo de e-mail do cliente em "off": a caixa fica travada, com o motivo',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(buildType({ clientEmailType: 'off' }))

      expect(checkbox('E-mail').disabled).toBe(true)
      expect(checkbox('WhatsApp').disabled).toBe(false)
      expect(blockText()).toContain('Escolha acima o e-mail do cliente')
    }),
  )

  test(
    'a prévia é a do SDK: moldura do canal com o texto renderizado e o boleto como anexo',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: OFF,
            whatsapp: { enabled: true, sendMode: 'manual', templateKey: 'boleto.prorrogado' },
          },
        }),
      )

      await waitFor(() => expect(blockText()).toContain('Boleto da nota 123456/1 de Supermercado'))
      expect(blockText()).toContain('boleto-nota-123456.pdf')
      expect(blockText()).toContain('Texto puro, sem assunto')
      expect(block().querySelector('[class*="adn-"]')).not.toBeNull()
    }),
  )

  test(
    'o e-mail mostra o assunto do modelo escolhido e a prévia só com o canal marcado',
    scenario({ clientChannelTemplates: CHOICES }, async () => {
      await mount(
        buildType({
          clientChannels: {
            email: { enabled: true, sendMode: 'automatic', templateKey: 'boleto.prorrogado' },
            whatsapp: OFF,
          },
        }),
      )

      await waitFor(() =>
        expect(blockText()).toContain('Assunto: Boleto da nota {{numeroNota}} prorrogado'),
      )
      expect(blockText()).toContain('Boleto da nota 123456/1 prorrogado')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(
        buildType({
          clientChannels: {
            email: { enabled: false, sendMode: 'automatic', templateKey: 'boleto.prorrogado' },
            whatsapp: OFF,
          },
        }),
      )
      await waitFor(() => expect(trigger('E-mail: Modelo (Notificações)').disabled).toBe(false))
      expect(blockText()).not.toContain('Prévia')
    }),
  )
})
