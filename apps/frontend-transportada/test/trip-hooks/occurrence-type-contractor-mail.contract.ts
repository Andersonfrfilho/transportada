/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.2 (RF2, RF3, RF4, RF5): o bloco "E-mail à contratante" do tipo montado de verdade — o
 * interruptor, os três textos, os marcadores clicáveis de cada campo, o erro de marcador no próprio campo, a
 * prévia que vem do servidor com `debounce`, e o "Aviso interno" com a dica certa. Procura o que cada
 * controle mostra, não o texto da fonte. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { createUnexpectedTripClient } from '../fixtures/tripAssemblyHooks.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

type PreviewInput = Readonly<{
  emailBody: string
  emailItemLineTemplate: string
  emailSubject: string
}>

const saved: OccurrenceTypeSaveInput[] = []
const previewCalls: PreviewInput[] = []
const mounted: { unmount: () => void }[] = []

const SUBJECT = 'OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}}'
const BODY = 'NFD {{numeroReferencia}} – R$ {{valorDeclarado}}\n\n{{linhasItens}}'
const LINE = '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}}'

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    emailBody: BODY,
    emailItemLineTemplate: LINE,
    emailSubject: SUBJECT,
    emailTemplateKey: null,
    emailsContractor: true,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Devolução parcial',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function installPreview(options: Readonly<{ fails?: boolean }> = {}): void {
  previewCalls.length = 0
  tripHookFakes.tripClient = {
    ...createUnexpectedTripClient(),
    previewOccurrenceTypeEmail: (input) => {
      previewCalls.push(input)
      if (options.fails === true) return Promise.reject(new Error('REQUEST_FAILED'))
      return Promise.resolve({
        body: `CORPO RENDERIZADO (${input.emailBody.length})`,
        subject: `ASSUNTO RENDERIZADO (${input.emailSubject.length})`,
      })
    },
  }
}

function scenario(body: () => Promise<void>, options: { fails?: boolean } = {}) {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    installPreview(options)
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

type TextField = HTMLInputElement | HTMLTextAreaElement

function field(label: string): TextField {
  const found = document.querySelector<TextField>(`[aria-label="${label}"]`)
  if (found === null) throw new Error(`FIELD_NOT_FOUND:${label}`)
  return found
}

async function typeInto(label: string, value: string): Promise<void> {
  const target = field(label)
  const prototype =
    target instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

async function focusWithCaret(label: string, caret: number): Promise<void> {
  const target = field(label)
  await act(async () => {
    target.focus()
    target.setSelectionRange(caret, caret)
    await Promise.resolve()
  })
}

function marker(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === `{{${name}}}`,
  )
}

function buttonByLabel(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  )
}

async function toggle(label: string): Promise<void> {
  const node = [...document.querySelectorAll<HTMLElement>('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (node === undefined) throw new Error(`CHECKBOX_NOT_FOUND:${label}`)
  await click(node)
}

function blockText(): string {
  return document.body.textContent ?? ''
}

function alerts(): string[] {
  return [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent ?? '')
}

const SWITCH = 'Mandar e-mail à contratante da nota ao registrar'

describe('o bloco E-mail à contratante (spec 247 RF3)', () => {
  test(
    'mostra o interruptor ligado, o assunto, o corpo e a linha de cada produto como estão gravados',
    scenario(async () => {
      await mount(buildType())
      expect(blockText()).toContain('E-mail à contratante')
      expect(
        document.querySelector<HTMLInputElement>('input[type="checkbox"]:checked'),
      ).not.toBeNull()
      expect(field('Assunto').value).toBe(SUBJECT)
      expect(field('Corpo').value).toBe(BODY)
      expect(field('Linha de cada produto').value).toBe(LINE)
    }),
  )

  test(
    'API anterior ao campo não oferece o bloco; ele fica entre "O que exige" e "Aviso interno"',
    scenario(async () => {
      const { emailsContractor, ...legacy } = buildType()
      void emailsContractor
      await mount(legacy)
      expect(blockText()).not.toContain('E-mail à contratante')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType())
      const text = blockText()
      expect(text.indexOf('O que exige')).toBeLessThan(text.indexOf('E-mail à contratante'))
      expect(text.indexOf('E-mail à contratante')).toBeLessThan(text.indexOf('Aviso interno'))
    }),
  )

  test(
    'a notificação vira "Aviso interno", e a dica diz que vai a quem despachou a viagem',
    scenario(async () => {
      await mount(buildType())
      const text = blockText()
      expect(text).toContain('Aviso interno')
      expect(text).toContain('quem despachou a viagem')
      expect(text).not.toContain('O e-mail que o contratante recebe')
      expect(document.querySelector('button[aria-label="Modelo da notificação"]')).not.toBeNull()
    }),
  )
})

describe('salvar nunca zera o e-mail (RF2)', () => {
  test(
    'o interruptor grava emailsContractor e leva assunto e corpo como estão',
    scenario(async () => {
      await mount(buildType())
      await toggle(SWITCH)
      expect(saved).toHaveLength(1)
      expect(saved[0]?.emailsContractor).toBe(false)
      expect(saved[0]?.emailSubject).toBe(SUBJECT)
      expect(saved[0]?.emailBody).toBe(BODY)
    }),
  )

  test(
    'uma edição que nada tem a ver com o e-mail também leva o assunto e o corpo gravados',
    scenario(async () => {
      await mount(buildType())
      await toggle('Avisar quando acontecer')
      expect(saved[0]?.notifies).toBe(true)
      expect(saved[0]?.emailSubject).toBe(SUBJECT)
      expect(saved[0]?.emailBody).toBe(BODY)
      expect(saved[0]).not.toHaveProperty('emailItemLineTemplate')
      expect(saved[0]).not.toHaveProperty('emailsContractor')
    }),
  )

  test(
    'Salvar e-mail grava os três textos de uma vez, sem mexer no interruptor',
    scenario(async () => {
      await mount(buildType())
      expect(buttonByLabel('Salvar e-mail')?.disabled).toBe(true)
      await typeInto('Assunto', 'DEVOLUÇÃO TOTAL – NF {{numeroNotaSemSerie}}')
      await typeInto('Linha de cada produto', '{{codigoItem}} – {{somaItem}}')
      expect(buttonByLabel('Salvar e-mail')?.disabled).toBe(false)
      await click(buttonByLabel('Salvar e-mail') as HTMLElement)

      expect(saved).toHaveLength(1)
      expect(saved[0]?.emailSubject).toBe('DEVOLUÇÃO TOTAL – NF {{numeroNotaSemSerie}}')
      expect(saved[0]?.emailBody).toBe(BODY)
      expect(saved[0]?.emailItemLineTemplate).toBe('{{codigoItem}} – {{somaItem}}')
      expect(saved[0]).not.toHaveProperty('emailsContractor')
    }),
  )

  test(
    'Desfazer volta aos textos gravados e some com os botões',
    scenario(async () => {
      await mount(buildType())
      await typeInto('Corpo', 'outro texto')
      await click(buttonByLabel('Desfazer') as HTMLElement)
      expect(field('Corpo').value).toBe(BODY)
      expect(buttonByLabel('Desfazer')).toBeUndefined()
      expect(saved).toHaveLength(0)
    }),
  )
})

describe('marcadores clicáveis, uma lista fechada por campo (RF5)', () => {
  test(
    'cada campo mostra os marcadores do seu contexto, e só eles',
    scenario(async () => {
      await mount(buildType())
      await focusWithCaret('Assunto', 0)
      expect(marker('contratante')).toBeDefined()
      expect(marker('linhasItens')).toBeUndefined()
      expect(marker('somaItem')).toBeUndefined()

      await focusWithCaret('Corpo', 0)
      expect(marker('linhasItens')).toBeDefined()
      expect(marker('somaItens')).toBeDefined()
      expect(marker('valorItem')).toBeUndefined()

      await focusWithCaret('Linha de cada produto', 0)
      expect(marker('valorItem')).toBeDefined()
      expect(marker('unidadeItem')).toBeDefined()
      expect(marker('linhasItens')).toBeUndefined()
    }),
  )

  test(
    'o clique insere o marcador onde o cursor está, no campo certo, sem gravar',
    scenario(async () => {
      await mount(buildType({ emailBody: 'ABC' }))
      await focusWithCaret('Corpo', 1)
      await click(marker('contratante') as HTMLElement)
      expect(field('Corpo').value).toBe('A{{contratante}}BC')
      expect(field('Assunto').value).toBe(SUBJECT)
      expect(saved).toHaveLength(0)

      await focusWithCaret('Assunto', 0)
      await click(marker('data') as HTMLElement)
      expect(field('Assunto').value.startsWith('{{data}}OCORRÊNCIA')).toBe(true)
    }),
  )
})

describe('marcador desconhecido: o erro aparece no próprio campo (RF5, CA04)', () => {
  test(
    'um marcador escrito errado nomeia o marcador, trava o salvar e não pede prévia',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(previewCalls.length).toBeGreaterThan(0))
      const before = previewCalls.length
      await typeInto('Corpo', 'NFD {{numeroNfd}}')

      const message = alerts().find((text) => text.includes('{{numeroNfd}}'))
      expect(message).toBeDefined()
      expect(field('Corpo').getAttribute('aria-invalid')).toBe('true')
      expect(field('Assunto').getAttribute('aria-invalid')).not.toBe('true')
      expect(buttonByLabel('Salvar e-mail')?.disabled).toBe(true)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
      })
      expect(previewCalls.length).toBe(before)
    }),
  )

  test(
    'marcador de outro contexto também é recusado: {{linhasItens}} na linha, {{valorItem}} no assunto',
    scenario(async () => {
      await mount(buildType())
      await typeInto('Linha de cada produto', '{{linhasItens}}')
      expect(field('Linha de cada produto').getAttribute('aria-invalid')).toBe('true')
      await typeInto('Linha de cada produto', LINE)
      expect(field('Linha de cada produto').getAttribute('aria-invalid')).not.toBe('true')

      await typeInto('Assunto', 'NF {{valorItem}}')
      expect(field('Assunto').getAttribute('aria-invalid')).toBe('true')
      expect(buttonByLabel('Salvar e-mail')?.disabled).toBe(true)
    }),
  )
})

describe('a prévia vem do servidor, com debounce (RF4)', () => {
  test(
    'pede a prévia dos textos gravados e mostra o que o servidor devolveu',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(blockText()).toContain('CORPO RENDERIZADO'))
      expect(blockText()).toContain('ASSUNTO RENDERIZADO')
      expect(previewCalls[0]).toEqual({
        emailBody: BODY,
        emailItemLineTemplate: LINE,
        emailSubject: SUBJECT,
      })
    }),
  )

  test(
    'três digitações seguidas viram uma só chamada, com o último texto',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(previewCalls).toHaveLength(1))
      await typeInto('Corpo', 'a')
      await typeInto('Corpo', 'ab')
      await typeInto('Corpo', 'abc')
      expect(previewCalls).toHaveLength(1)
      await waitFor(() => expect(previewCalls).toHaveLength(2))
      expect(previewCalls[1]?.emailBody).toBe('abc')
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
      })
      expect(previewCalls).toHaveLength(2)
    }),
  )

  test(
    'servidor fora do ar: a tela diz que não gerou a prévia e mantém o que foi digitado',
    scenario(
      async () => {
        await mount(buildType())
        await waitFor(() => expect(blockText()).toContain('Não foi possível gerar a prévia'))
        expect(field('Corpo').value).toBe(BODY)
      },
      { fails: true },
    ),
  )

  test(
    'a nota da prévia diz se o e-mail sai sozinho; tipo sem produtos avisa que {{linhasItens}} sai vazio',
    scenario(async () => {
      await mount(buildType())
      expect(blockText()).toContain('Sai automaticamente quando o tipo é registrado')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ emailsContractor: false, itemsMode: 'off' }))
      expect(blockText()).toContain('Desligado: o operador manda pela conversa')
      expect(blockText()).toContain('sem produtos')
    }),
  )
})
