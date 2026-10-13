/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF9–RF11 (T4.7, CA07): "Enviar ao cliente da nota" e "Encaminhar para um e-mail" **montados de
 * verdade**. Nota sem e-mail deixa o botão desligado com o motivo à vista; o endereço informado é conferido no
 * campo, com a mensagem ali, antes de qualquer chamada; a recusa da API aparece no mesmo campo; o envio em curso
 * trava o botão; e cada envio novo ganha uma `Idempotency-Key` nova. O cliente HTTP é trocado uma vez.
 */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { OccurrenceConversationRequestError } from '../../src/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import type {
  ContractorReplyEmailOptions,
  ContractorReplyEmailOutcome,
} from '../../src/modules/occurrence-conversation/shared/contractorReplyEmail.service'

import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

import '../../src/modules/shared/i18n/i18n.service'

const OPTIONS: ContractorReplyEmailOptions = {
  deliveries: [],
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
  noteRecipient: { addressMasked: 'c***@d***.example.test', isAvailable: true },
  sentCount: 0,
  sentLimit: 5,
}

const fakes: {
  forward: (input: Record<string, unknown>) => Promise<ContractorReplyEmailOutcome>
  options: ContractorReplyEmailOptions | null
  sent: Array<Record<string, unknown>>
} = {
  forward: () => Promise.resolve({ addressMasked: 'c***@d***.example.test', kind: 'queued' }),
  options: OPTIONS,
  sent: [],
}

void mock.module(
  '../../src/modules/occurrence-conversation/shared/contractorReplyEmailClient.provider',
  () => ({
    getContractorReplyEmailClient: () => ({
      forwardContractorReplyByEmail: (input: Record<string, unknown>) => {
        fakes.sent.push(input)
        return fakes.forward(input)
      },
      readContractorReplyEmailOptions: () => Promise.resolve(fakes.options),
    }),
  }),
)

const { ContractorReplyEmailActions } = await import(
  '../../src/modules/occurrence-conversation/components/ContractorReplyEmailActions.component'
)

async function mountActions(): Promise<void> {
  await renderWithQueryClient(
    createElement(ContractorReplyEmailActions, {
      attachmentId: 'attachment-1',
      occurrenceId: 'occurrence-1',
    }),
  )
  await settle()
}

function buttons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll('button')]
}

function buttonByText(text: RegExp): HTMLButtonElement {
  const found = buttons().find((button) => text.test(button.textContent ?? ''))
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text.source}`)
  return found
}

async function click(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
  await settle()
}

async function typeAddress(value: string): Promise<void> {
  const field = document.body.querySelector<HTMLInputElement>('input')
  if (field === null) throw new Error('FIELD_NOT_FOUND')
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

const text = (): string => document.body.textContent ?? ''

describe('o boleto da contratante por e-mail (spec 248 T4.7)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    fakes.sent = []
    fakes.options = OPTIONS
    fakes.forward = () =>
      Promise.resolve({ addressMasked: 'c***@d***.example.test', kind: 'queued' })
  })

  it('ocorrência sem retorno: nenhum botão', async () => {
    fakes.options = null
    await mountActions()
    expect(buttons()).toEqual([])
  })

  it('os dois modos desligados: nenhum botão', async () => {
    fakes.options = { ...OPTIONS, forwardToInformedEmail: 'off', forwardToNoteRecipient: 'off' }
    await mountActions()
    expect(buttons()).toEqual([])
  })

  it('enviar ao cliente da nota manda o alvo da nota, sem endereço, e diz para onde foi (mascarado)', async () => {
    await mountActions()

    await click(buttonByText(/Enviar ao cliente da nota/u))

    expect(fakes.sent).toHaveLength(1)
    expect(fakes.sent[0]).toMatchObject({
      attachmentId: 'attachment-1',
      occurrenceId: 'occurrence-1',
      target: 'note_recipient_email',
    })
    expect(fakes.sent[0]).not.toHaveProperty('address')
    expect(String(fakes.sent[0]?.idempotencyKey)).toMatch(/^reply-email:/u)
    await waitFor(() => expect(text()).toContain('Na fila para envio a c***@d***.example.test.'))
  })

  it('nota sem e-mail: o botão fica desligado, o motivo à vista e nada é enviado', async () => {
    fakes.options = { ...OPTIONS, noteRecipient: { addressMasked: null, isAvailable: false } }
    await mountActions()

    const button = buttonByText(/Enviar ao cliente da nota/u)
    expect(button.disabled).toBe(true)
    expect(text()).toContain('A nota não tem e-mail do cliente')
    expect(button.getAttribute('aria-describedby')).not.toBeNull()
    await click(button)
    expect(fakes.sent).toEqual([])
    expect(buttonByText(/Encaminhar para um e-mail/u).disabled).toBe(false)
  })

  it('o teto de cinco desliga os dois botões e diz por quê', async () => {
    fakes.options = { ...OPTIONS, sentCount: 5 }
    await mountActions()
    expect(buttonByText(/Enviar ao cliente da nota/u).disabled).toBe(true)
    expect(buttonByText(/Encaminhar para um e-mail/u).disabled).toBe(true)
    expect(text()).toContain('Limite de 5 e-mails por ocorrência atingido.')
  })

  it('endereço inválido: a mensagem fica no campo e a API nem é chamada', async () => {
    await mountActions()
    await click(buttonByText(/Encaminhar para um e-mail/u))

    for (const invalid of ['', 'a@b.com,c@d.com', 'x@y.com\nBcc: z@w.com']) {
      await typeAddress(invalid)
      await click(buttonByText(/^Enviar$/u))
      const field = document.body.querySelector('input')
      expect(field?.getAttribute('aria-invalid')).toBe('true')
      expect(text()).toContain('Informe um endereço de e-mail só')
    }
    expect(fakes.sent).toEqual([])
  })

  it('endereço válido: manda o alvo informado com o endereço, fecha o formulário e limpa o campo', async () => {
    await mountActions()
    await click(buttonByText(/Encaminhar para um e-mail/u))
    await typeAddress('  financeiro@cliente.example.test ')

    await click(buttonByText(/^Enviar$/u))

    expect(fakes.sent).toHaveLength(1)
    expect(fakes.sent[0]).toMatchObject({
      address: 'financeiro@cliente.example.test',
      target: 'informed_email',
    })
    await waitFor(() => expect(document.body.querySelector('input')).toBeNull())
  })

  it('a recusa da API (400) aparece no campo, e o formulário segue aberto para corrigir', async () => {
    fakes.forward = () =>
      Promise.reject(
        new OccurrenceConversationRequestError('CONTRACTOR_REPLY_EMAIL_ADDRESS_INVALID'),
      )
    await mountActions()
    await click(buttonByText(/Encaminhar para um e-mail/u))
    await typeAddress('financeiro@cliente.example.test')

    await click(buttonByText(/^Enviar$/u))

    expect(document.body.querySelector('input')?.getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Informe um endereço de e-mail só')
  })

  it('cada envio ganha uma chave nova; a falha do servidor diz o motivo, sem código cru', async () => {
    await mountActions()
    await click(buttonByText(/Enviar ao cliente da nota/u))
    await click(buttonByText(/Enviar ao cliente da nota/u))
    expect(new Set(fakes.sent.map((call) => call.idempotencyKey)).size).toBe(2)

    fakes.forward = () =>
      Promise.reject(new OccurrenceConversationRequestError('CONTRACTOR_REPLY_EMAIL_LIMIT_REACHED'))
    await click(buttonByText(/Enviar ao cliente da nota/u))
    await waitFor(() => expect(text()).toContain('Limite de 5 e-mails por ocorrência atingido.'))
    expect(text()).not.toContain('CONTRACTOR_REPLY_EMAIL_LIMIT_REACHED')
  })

  it('envio em curso trava o botão: o clique repetido não manda de novo', async () => {
    fakes.forward = () => new Promise(() => undefined)
    await mountActions()
    await click(buttonByText(/Enviar ao cliente da nota/u))

    expect(buttonByText(/Enviar ao cliente da nota/u).disabled).toBe(true)
    await click(buttonByText(/Enviar ao cliente da nota/u))
    expect(fakes.sent).toHaveLength(1)
  })

  it('desfecho pulado e arquivo grande demais dizem o motivo em vez de "enviado"', async () => {
    fakes.forward = () =>
      Promise.resolve({ kind: 'failed', reason: 'attachment_too_large_for_email' })
    await mountActions()
    await click(buttonByText(/Enviar ao cliente da nota/u))
    await waitFor(() => expect(text()).toContain('passa de 10 MB'))
    expect(text()).not.toContain('Na fila')
  })
})
