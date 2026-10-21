/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF10/RF11 (T4.7): o bloco "Retorno da contratante" da aba Tipos **montado de verdade**, com o seletor
 * "enviar o boleto ao e-mail do cliente da nota", o do e-mail informado e o assunto e o corpo do e-mail ao
 * terceiro. A CHECK `forward_needs_text` aparece como mensagem no campo, e o "Salvar retorno" só destrava com os
 * dois textos; o `PUT` leva os onze campos de uma vez.
 */
import { act, createElement } from 'react'
import { describe, expect, it } from 'bun:test'

import { renderWithQueryClient, settle } from './renderHook.helper'

import '../../src/modules/shared/i18n/i18n.service'
import { OccurrenceTypeContractorReply } from '../../src/modules/trip/components/OccurrenceTypeContractorReply.component'
import type { OccurrenceType } from '../../src/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '../../src/modules/trip/shared/occurrenceTypeUpdate.service'

const BASE = {
  active: true,
  allowsMultipleItems: true,
  attachmentMode: 'off',
  contractorReplyMode: 'forward_after_approval',
  contractorReplyWaitHours: 6,
  driverReplyTemplate: 'Segue o boleto.',
  emailTemplateKey: null,
  emailsContractor: true,
  flow: 'document',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Prorrogação de boleto',
  notifies: false,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as unknown as OccurrenceType

async function mountBlock(
  overrides: Partial<OccurrenceType> = {},
  onEdit: (edit: OccurrenceTypeEdit) => void = () => undefined,
): Promise<void> {
  document.body.replaceChildren()
  await renderWithQueryClient(
    createElement(OccurrenceTypeContractorReply, {
      disabled: false,
      onEdit,
      type: { ...BASE, ...overrides },
    }),
  )
  await settle()
}

function fieldByLabel(label: RegExp): HTMLInputElement | HTMLTextAreaElement {
  const found = [...document.body.querySelectorAll('label')].find((candidate) =>
    label.test(candidate.textContent ?? ''),
  )
  const control = found?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  if (control === undefined || control === null) throw new Error(`FIELD_NOT_FOUND:${label.source}`)
  return control
}

async function typeInto(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(control, value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

const saveButton = (): HTMLButtonElement => {
  const found = [...document.body.querySelectorAll('button')].find((button) =>
    /Salvar retorno/u.test(button.textContent ?? ''),
  )
  if (found === undefined) throw new Error('SAVE_NOT_FOUND')
  return found
}

const text = (): string => document.body.textContent ?? ''

describe('o envio do boleto por e-mail na aba Tipos (spec 248 T4.7)', () => {
  it('os dois seletores aparecem, e sem envio ligado não há assunto nem corpo a escrever', async () => {
    await mountBlock()

    expect(text()).toContain('Enviar o boleto ao e-mail do cliente da nota')
    expect(text()).toContain('Encaminhar o boleto a um e-mail informado')
    expect(text()).not.toContain('Assunto do e-mail ao terceiro')
    expect(text()).not.toContain('Texto do e-mail ao terceiro')
  })

  it('envio ligado e sem texto: a mensagem fica em cada campo e o Salvar retorno não destrava', async () => {
    await mountBlock({ forwardToNoteRecipient: 'manual' })

    expect(fieldByLabel(/Assunto do e-mail ao terceiro/u).getAttribute('aria-invalid')).toBe('true')
    expect(fieldByLabel(/Texto do e-mail ao terceiro/u).getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('o e-mail ao terceiro não sai sem os dois')
    expect(saveButton().disabled).toBe(true)
  })

  it('só o e-mail informado ligado também cobra os dois textos', async () => {
    await mountBlock({ forwardToInformedEmail: 'manual' })
    expect(fieldByLabel(/Assunto do e-mail ao terceiro/u).getAttribute('aria-invalid')).toBe('true')
  })

  it('escrever os dois textos limpa as mensagens e o PUT leva os doze campos de uma vez', async () => {
    const edits: OccurrenceTypeEdit[] = []
    await mountBlock({ forwardToNoteRecipient: 'manual' }, (edit) => edits.push(edit))

    await typeInto(fieldByLabel(/Assunto do e-mail ao terceiro/u), 'Boleto prorrogado')
    expect(saveButton().disabled).toBe(true)
    await typeInto(fieldByLabel(/Texto do e-mail ao terceiro/u), 'Segue o boleto atualizado.')
    expect(text()).not.toContain('o e-mail ao terceiro não sai sem os dois')
    expect(saveButton().disabled).toBe(false)

    await act(async () => {
      saveButton().click()
      await Promise.resolve()
    })

    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({
      forwardEmailBody: 'Segue o boleto atualizado.',
      forwardEmailSubject: 'Boleto prorrogado',
      forwardToInformedEmail: 'off',
      forwardToNoteRecipient: 'manual',
    })
    expect(Object.keys(edits[0] ?? {})).toHaveLength(12)
  })

  it('o assunto e o corpo respeitam o teto do banco (200 e 4000)', async () => {
    await mountBlock({ forwardToNoteRecipient: 'manual' })
    expect(fieldByLabel(/Assunto do e-mail ao terceiro/u).getAttribute('maxlength')).toBe('200')
    expect(fieldByLabel(/Texto do e-mail ao terceiro/u).getAttribute('maxlength')).toBe('4000')
  })
})
