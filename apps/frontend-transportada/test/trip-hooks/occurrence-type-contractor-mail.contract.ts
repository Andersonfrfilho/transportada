/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T4.1/T4.2 (RF1-RF7, RF9): o bloco "E-mail à contratante" do tipo — Modelo (do módulo de notificação, só os
 * utilizáveis, com prévia), Em cópia (responsáveis da empresa, até 10) e Destinatários (só no tipo de contratantes).
 * Procura o que cada controle mostra e o que grava. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import type { ContractorMailTemplateChoice } from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { installMailChoiceDouble, mailChoiceFakes } from './occurrenceTypeMailHarness.helper'
import type { MailChoiceFakes } from './occurrenceTypeMailHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

function buildTemplate(
  overrides: Partial<ContractorMailTemplateChoice>,
): ContractorMailTemplateChoice {
  return {
    body: 'Nota {{numeroNota}} na {{contratante}}',
    key: 'ocorrencia.avaria',
    problems: [],
    subject: 'Ocorrência {{numeroNota}}',
    usable: true,
    version: 1,
    ...overrides,
  }
}

const TEMPLATES: readonly ContractorMailTemplateChoice[] = [
  buildTemplate({ key: 'ocorrencia.avaria' }),
  buildTemplate({ key: 'ocorrencia.falta', subject: 'Falta na nota' }),
  buildTemplate({
    key: 'trip.delivery-occurrence',
    problems: [{ code: 'system_key' }],
    usable: false,
  }),
  buildTemplate({ key: 'com.html', problems: [{ code: 'unsafe_html' }], usable: false }),
  buildTemplate({
    body: '<table><tr><td>Nota {{numeroNota}} na {{contratante}}</td></tr></table>',
    key: 'ocorrencia.html',
  }),
]

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
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
    name: 'Avaria',
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
      createElement(OccurrenceTypeRow, {
        canManage: true,
        exceptions: EMPTY_EXCEPTIONS_STATE,
        isSaving: false,
        onSave: (input) => saved.push(input),
        templates: { options: [], status: 'ready' },
        type,
      }),
    ),
  )
}

function trigger(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`TRIGGER_NOT_FOUND:${label}`)
  return found
}

function optionTexts(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent?.trim() ?? '',
  )
}

async function openOptions(label: string): Promise<void> {
  await waitFor(() => expect(trigger(label).disabled).toBe(false))
  await click(trigger(label))
  await waitFor(() => expect(optionTexts().length).toBeGreaterThan(0))
}

async function choose(label: string, optionText: string): Promise<void> {
  await openOptions(label)
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
    (candidate.textContent ?? '').includes(optionText),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

function pageText(): string {
  return document.body.textContent ?? ''
}

describe('o seletor do modelo do e-mail à contratante (spec 271 RF1-RF4)', () => {
  test(
    'lista "Nenhum" e só os modelos utilizáveis do módulo, sem aviso do sistema nem HTML',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType())
      await openOptions('Modelo')

      expect(optionTexts()).toEqual([
        'Nenhum',
        expect.stringContaining('ocorrencia.avaria'),
        expect.stringContaining('ocorrencia.falta'),
        expect.stringContaining('ocorrencia.html'),
      ] as unknown as string[])
      expect(optionTexts().join(' ')).not.toContain('trip.delivery-occurrence')
      expect(optionTexts().join(' ')).not.toContain('com.html')
    }),
  )

  test(
    'mostra o modelo escolhido, a prévia com valores de exemplo e o link para criar em Notificações',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType({ contractorNotificationTemplateKey: 'ocorrencia.avaria' }))
      await waitFor(() => expect(pageText()).toContain('Nota 123456/1 na Contratante Exemplo'))

      expect(pageText()).toContain('Ocorrência 123456/1')
      expect(pageText()).toContain('Criar modelo em Notificações')
      expect(trigger('Modelo').textContent).toContain('ocorrencia.avaria')
    }),
  )

  test(
    'escolher grava a chave na hora, sem tocar nos outros campos; "Nenhum" limpa com null',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType())
      await choose('Modelo', 'ocorrencia.falta')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorNotificationTemplateKey).toBe('ocorrencia.falta')
      expect(saved[0]).not.toHaveProperty('emailsContractor')
      expect(saved[0]).not.toHaveProperty('contractorMailWatcherUserIds')
      saved.length = 0
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ contractorNotificationTemplateKey: 'ocorrencia.falta' }))
      await choose('Modelo', 'Nenhum')
      expect(saved[0]?.contractorNotificationTemplateKey).toBeNull()
    }),
  )

  test(
    'o aviso de tipo sem modelo só aparece com o e-mail ligado e o servidor dizendo que falta',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType({ missingNotificationTemplate: true }))
      expect(pageText()).toContain('Tipo sem modelo de notificação')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ missingNotificationTemplate: false }))
      expect(pageText()).not.toContain('Tipo sem modelo de notificação')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ emailsContractor: false, missingNotificationTemplate: true }))
      expect(pageText()).not.toContain('Tipo sem modelo de notificação')
    }),
  )

  test(
    'modelo já escolhido que deixou de servir fica à vista, com o motivo',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType({ contractorNotificationTemplateKey: 'com.html' }))
      await waitFor(() => expect(pageText()).toContain('conteúdo ativo'))
      expect(trigger('Modelo').textContent).toContain('com.html')
    }),
  )

  test(
    'modelo com corpo HTML aparece num iframe sandbox vazio com os valores de exemplo; texto segue em pre',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType({ contractorNotificationTemplateKey: 'ocorrencia.html' }))
      await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
      const frame = document.querySelector('iframe') as HTMLIFrameElement

      expect(frame.getAttribute('sandbox')).toBe('')
      expect(frame.getAttribute('srcdoc')).toContain('Nota 123456/1 na Contratante Exemplo')
      expect(frame.getAttribute('srcdoc')).not.toContain('{{')
      expect(document.querySelector('pre[class*="mailBody"]')).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ contractorNotificationTemplateKey: 'ocorrencia.avaria' }))
      await waitFor(() => expect(pageText()).toContain('Nota 123456/1 na Contratante Exemplo'))
      expect(document.querySelector('iframe')).toBeNull()
    }),
  )

  test(
    'modelo escolhido que sumiu do módulo continua na lista, marcado pela própria chave',
    scenario({ templates: TEMPLATES }, async () => {
      await mount(buildType({ contractorNotificationTemplateKey: 'apagado.no.modulo' }))
      await waitFor(() => expect(trigger('Modelo').textContent).toContain('apagado.no.modulo'))
    }),
  )
})

const WATCHERS = [
  { eligible: true, maskedEmail: 'a***@e.test', name: 'Ana', status: 'active', userId: 'user-ana' },
  {
    eligible: true,
    maskedEmail: 'b***@e.test',
    name: 'Bruno',
    status: 'active',
    userId: 'user-bruno',
  },
  { eligible: false, maskedEmail: null, name: 'Carla', status: 'active', userId: 'user-carla' },
  {
    eligible: true,
    maskedEmail: 'd***@e.test',
    name: 'Davi',
    status: 'inactive',
    userId: 'user-davi',
  },
] as const

describe('Em cópia (spec 271 RF5)', () => {
  test(
    'oferece só os ativos e elegíveis da lista da empresa e grava a escolha',
    scenario({ templates: TEMPLATES, watchers: WATCHERS }, async () => {
      await mount(buildType())
      await openOptions('Em cópia')

      expect(optionTexts()).toEqual(['Ana', 'Bruno'])
      await click(
        [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
          (option.textContent ?? '').includes('Bruno'),
        ) as HTMLElement,
      )
      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorMailWatcherUserIds).toEqual(['user-bruno'])
      expect(saved[0]).not.toHaveProperty('contractorNotificationTemplateKey')
    }),
  )

  test(
    'quem já está escolhido e deixou de poder receber aparece marcado',
    scenario({ templates: TEMPLATES, watchers: WATCHERS }, async () => {
      await mount(
        buildType({
          contractorMailWatchers: [
            { eligible: true, name: 'Davi', status: 'inactive', userId: 'user-davi' },
            { eligible: false, name: 'Carla', status: 'active', userId: 'user-carla' },
          ],
        }),
      )
      await waitFor(() => expect(trigger('Em cópia').textContent).toContain('2'))
      await openOptions('Em cópia')

      expect(optionTexts()).toContain('Davi (inativo na lista da empresa)')
      expect(optionTexts()).toContain('Carla (sem permissão ou sem e-mail)')
    }),
  )

  test(
    'com a escolha vazia a frase diz qual lista vale; API anterior ao bloco não mostra o campo',
    scenario({ templates: TEMPLATES, watchers: WATCHERS }, async () => {
      await mount(buildType())
      expect(pageText()).toContain('Vazio: vale a lista da contratante da nota')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      const { contractorMailWatchers, ...withoutBlock } = buildType()
      void contractorMailWatchers
      await mount(withoutBlock)
      expect(document.querySelector('button[aria-label="Em cópia"]')).toBeNull()
    }),
  )
})

const LISTED = {
  contractors: [
    { displayName: 'ZARAGOZA', id: 'c-z', status: 'active', taxId: '12345678000195' },
    { displayName: 'RIBER PET', id: 'c-r', status: 'active', taxId: '11222333000181' },
  ],
  contractorScope: 'listed',
} as const

const CANDIDATES = [
  {
    contactId: 'contact-z1',
    contractorId: 'c-z',
    email: 'compras@zaragoza.example.test',
    name: 'Compras',
    receivesOccurrences: true,
    status: 'active',
  },
  {
    contactId: 'contact-r1',
    contractorId: 'c-r',
    email: 'sac@riber.example.test',
    name: '',
    receivesOccurrences: true,
    status: 'active',
  },
] as const

describe('Destinatários (spec 271 RF6, RF7)', () => {
  test(
    'não aparece no tipo geral e nem consulta os contatos',
    scenario({ candidates: CANDIDATES, templates: TEMPLATES }, async () => {
      await mount(buildType())
      await Promise.resolve()

      expect(document.querySelector('button[aria-label="Destinatários"]')).toBeNull()
      expect(mailChoiceFakes.candidateRequests).toEqual([])
    }),
  )

  test(
    'no tipo de contratantes lê os contatos das contratantes do tipo e grava a escolha',
    scenario({ candidates: CANDIDATES, templates: TEMPLATES }, async () => {
      await mount(buildType(LISTED))
      await openOptions('Destinatários')

      expect(mailChoiceFakes.candidateRequests[0]).toEqual(['c-z', 'c-r'])
      /** A segunda linha de cada opção é a contratante: o contato vem agrupado por ela. */
      expect(optionTexts()).toEqual([
        'Compras · compras@zaragoza.example.testZARAGOZA',
        'sac@riber.example.testRIBER PET',
      ])
      await click(
        [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
          (option.textContent ?? '').includes('sac@riber'),
        ) as HTMLElement,
      )
      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorMailRecipientContactIds).toEqual(['contact-r1'])
    }),
  )

  test(
    'contato escolhido que deixou de receber ocorrências aparece marcado',
    scenario({ candidates: CANDIDATES, templates: TEMPLATES }, async () => {
      await mount(
        buildType({
          ...LISTED,
          contractorMailRecipients: [
            {
              contactId: 'contact-old',
              contractorId: 'c-z',
              email: 'antigo@zaragoza.example.test',
              name: 'Antigo',
              receivesOccurrences: false,
              status: 'active',
            },
          ],
        }),
      )
      await openOptions('Destinatários')

      expect(optionTexts()).toContain(
        'Antigo · antigo@zaragoza.example.test (não recebe ocorrências)ZARAGOZA',
      )
    }),
  )

  test(
    'tirar uma contratante do escopo avisa quantos contatos escolhidos saem junto, antes de aplicar',
    scenario({ candidates: CANDIDATES, templates: TEMPLATES }, async () => {
      await mount(
        buildType({
          ...LISTED,
          contractorMailRecipients: [
            {
              contactId: 'contact-r1',
              contractorId: 'c-r',
              email: 'sac@riber.example.test',
              name: '',
              receivesOccurrences: true,
              status: 'active',
            },
          ],
        }),
      )
      const scopeTrigger = document.querySelector<HTMLElement>('button[aria-label="Vale para"]')
      if (scopeTrigger === null) throw new Error('SCOPE_TRIGGER_NOT_FOUND')
      await click(scopeTrigger)
      const all = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
        (option.textContent ?? '').includes('Todas as contratantes'),
      )
      await click(all as HTMLElement)

      expect(pageText()).toContain(
        '1 contato escolhido como destinatário sai da escolha ao aplicar.',
      )
    }),
  )
})
