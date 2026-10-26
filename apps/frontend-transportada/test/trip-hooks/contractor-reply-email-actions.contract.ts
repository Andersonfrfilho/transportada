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
  clientEmailType: 'off',
  clientEmails: [],
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
  reads: number
  sent: Array<Record<string, unknown>>
  sentToClient: Array<Record<string, unknown>>
} = {
  forward: () => Promise.resolve({ addressMasked: 'c***@d***.example.test', kind: 'queued' }),
  options: OPTIONS,
  reads: 0,
  sent: [],
  sentToClient: [],
}

void mock.module(
  '../../src/modules/occurrence-conversation/shared/contractorReplyEmailClient.provider',
  () => ({
    getContractorReplyEmailClient: () => ({
      forwardContractorReplyByEmail: (input: Record<string, unknown>) => {
        fakes.sent.push(input)
        return fakes.forward(input)
      },
      forwardContractorReplyToClient: (input: Record<string, unknown>) => {
        fakes.sentToClient.push(input)
        return Promise.resolve({
          results: [{ addressMasked: 'f***@m***.example.test', kind: 'queued', reason: null }],
          savedEmailId: input.save === true ? 'email-9' : null,
        })
      },
      readContractorReplyEmailOptions: () => {
        fakes.reads += 1
        return Promise.resolve(fakes.options)
      },
    }),
  }),
)

const { ClientBoletoEmailAction } = await import(
  '../../src/modules/occurrence-conversation/components/ClientBoletoEmailAction.component'
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

async function mountAction(isEnabled = true): Promise<void> {
  await renderWithQueryClient(
    createElement(ClientBoletoEmailAction, {
      isEnabled,
      occurrenceId: 'occurrence-1',
      placement: 'page',
    }),
  )
  await settle()
}

async function typeClientAddress(value: string): Promise<void> {
  const field = document.body.querySelector<HTMLInputElement>('input[type="text"]')
  if (field === null) throw new Error('FIELD_NOT_FOUND')
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

const CLIENT_OPTIONS: ContractorReplyEmailOptions = {
  ...OPTIONS,
  clientEmailType: 'boleto',
  clientEmails: [
    { addressMasked: 'f***@m***.example.test', emailId: 'email-1', label: 'financeiro' },
    { addressMasked: 'd***@m***.example.test', emailId: 'email-2', label: '' },
  ],
}

describe('o botão Enviar ao cliente (spec 279 T5)', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    fakes.options = CLIENT_OPTIONS
    fakes.reads = 0
    fakes.sentToClient = []
  })

  it('tipo off: nenhum botão', async () => {
    fakes.options = { ...CLIENT_OPTIONS, clientEmailType: 'off' }
    await mountAction()
    expect(buttons()).toEqual([])
  })

  it('ocorrência sem retorno: nenhum botão', async () => {
    fakes.options = null
    await mountAction()
    expect(buttons()).toEqual([])
  })

  it('boleto ainda não aceito (desligado): nem consulta a API', async () => {
    await mountAction(false)
    expect(buttons()).toEqual([])
    expect(fakes.reads).toBe(0)
  })

  it('sem e-mail guardado o botão é Adicionar e-mail e o escritório digita o seu', async () => {
    fakes.options = { ...CLIENT_OPTIONS, clientEmails: [] }
    await mountAction()
    await click(buttonByText(/Adicionar e-mail/u))

    expect(text()).toContain('ainda não tem e-mail guardado')
    expect(buttonByText(/^Enviar$/u).disabled).toBe(true)
    await typeClientAddress('novo@mercado.example.test')
    await click(buttonByText(/^Enviar$/u))

    expect(fakes.sentToClient).toHaveLength(1)
    expect(fakes.sentToClient[0]).toMatchObject({
      address: 'novo@mercado.example.test',
      save: false,
    })
    expect(String(fakes.sentToClient[0]?.idempotencyKey)).toMatch(/^client-email:/u)
    await waitFor(() => expect(text()).toContain('f***@m***.example.test'))
  })

  it('com e-mails guardados vem tudo marcado e o envio vai por emailId, sem endereço', async () => {
    await mountAction()
    await click(buttonByText(/Enviar ao cliente/u))

    expect(text()).toContain('f***@m***.example.test')
    await click(buttonByText(/^Enviar$/u))

    expect(fakes.sentToClient[0]).toMatchObject({ emailIds: ['email-1', 'email-2'] })
    expect(fakes.sentToClient[0]).not.toHaveProperty('address')
    await waitFor(() => expect(text()).toContain('na fila para envio'))
  })

  it('endereço novo inválido: a mensagem fica no campo e a API não é chamada', async () => {
    await mountAction()
    await click(buttonByText(/Enviar ao cliente/u))
    await typeClientAddress('a@b.com,c@d.com')
    await click(buttonByText(/^Enviar$/u))

    expect(text()).toContain('Informe um endereço de e-mail só')
    expect(fakes.sentToClient).toEqual([])
  })

  it('guardar no cadastro só vale com endereço novo e vai como save', async () => {
    await mountAction()
    await click(buttonByText(/Enviar ao cliente/u))
    await typeClientAddress('novo@mercado.example.test')
    const save = [
      ...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].find(
      (box) => !box.disabled && box.closest('label')?.textContent?.includes('Guardar no cadastro'),
    )
    if (save === undefined) throw new Error('SAVE_NOT_FOUND')
    await click(save)
    await click(buttonByText(/^Enviar$/u))

    expect(fakes.sentToClient[0]).toMatchObject({
      address: 'novo@mercado.example.test',
      save: true,
    })
    await waitFor(() => expect(text()).toContain('ficou guardado no cadastro do cliente'))
  })
})
