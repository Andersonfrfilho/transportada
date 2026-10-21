/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 268: a ficha da contratante mostra e edita os contatos de ocorrência dela (sem seletor de contratante), a aba
 * "E-mail com contratantes" avisa quando a configuração falta e quando o ambiente manda o e-mail para o Mailpit, e a
 * seção de contatos dessa aba leva à ficha. Doubles dos clientes; nomes e endereços sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorContactsPanel } from '@/modules/delivery-clients/components/ContractorContactsPanel.component'
import { ContractorDirectoryPanel } from '@/modules/delivery-clients/components/ContractorDirectoryPanel.component'
import { MailSendReadinessSummary } from '@/modules/delivery-clients/components/MailSendReadinessSummary.component'

import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  ALFA_CONTACT,
  installContractorMailDouble,
  VERIFIED_SETTINGS,
} from './contractorMailHarness.helper'
import {
  buttonByText,
  click,
  CONTRACTOR_IDS,
  installContractorDirectoryDouble,
  resetLocation,
  rowNames,
  typeInto,
} from './contractorDirectoryHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const NO_MAIL_NOTICE = 'Sem esta configuração nenhum e-mail de ocorrência sai para a contratante.'
const SANDBOX_NOTICE =
  'Ambiente de teste: os e-mails para a contratante vão para o Mailpit, não saem para a internet.'

beforeEach(() => {
  document.body.innerHTML = ''
})

async function openFicha(
  canManage: boolean,
  mail: Parameters<typeof installContractorMailDouble>[0],
) {
  resetLocation()
  installContractorDirectoryDouble()
  const calls = installContractorMailDouble(mail)
  const rendered = await renderWithQueryClient(
    createElement(ContractorDirectoryPanel, { canManage }),
  )
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
  await click(
    document.querySelector(
      'button[aria-label="Abrir a ficha de Alfa Indústria Fictícia"]',
    ) as HTMLElement,
  )
  await waitFor(() => expect(document.body.textContent).toContain('Perfil de recebimento'))
  return { calls, rendered }
}

describe('os contatos de ocorrência na ficha da contratante (spec 268 RF10)', () => {
  test('a ficha lista os contatos da contratante, sem seletor de contratante', async () => {
    const restoreLayout = stubVisibleLayout()
    const { calls, rendered } = await openFicha(true, { contacts: [ALFA_CONTACT] })

    await waitFor(() => expect(document.body.textContent).toContain('Contatos de ocorrência'))
    await waitFor(() => expect(document.body.textContent).toContain('Compras Alfa'))
    expect(calls.contactLists).toEqual([CONTRACTOR_IDS.alfa])
    expect(calls.contractorListCalls.count).toBe(0)
    expect(document.querySelector('[aria-label="Contratante"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Escolha a contratante')
    rendered.unmount()
    restoreLayout()
  })

  test('desativa um contato pela ficha, na contratante da ficha', async () => {
    const restoreLayout = stubVisibleLayout()
    const { calls, rendered } = await openFicha(true, { contacts: [ALFA_CONTACT] })
    await waitFor(() => expect(document.body.textContent).toContain('Compras Alfa'))

    await click(buttonByText('Desativar'))

    await waitFor(() =>
      expect(calls.contactUpdates).toEqual([
        { body: { status: 'inactive' }, contactId: ALFA_CONTACT.id },
      ]),
    )
    rendered.unmount()
    restoreLayout()
  })

  test('adiciona um contato pela ficha, na contratante da ficha', async () => {
    const restoreLayout = stubVisibleLayout()
    const { calls, rendered } = await openFicha(true, { contacts: [] })
    await waitFor(() => expect(document.body.textContent).toContain('Nenhum contato cadastrado'))

    /** A ficha tem outro campo "E-mail" (o do relatório): o do contato é o do formulário de contato. */
    const contactForm = document.querySelector(
      'form[aria-labelledby="contractor-contact-create-title"]',
    )
    await typeInto(
      contactForm?.querySelector('input[type="email"]') as HTMLInputElement,
      'novo@alfa.example.test',
    )
    await click(buttonByText('Adicionar contato'))

    await waitFor(() => expect(calls.contactCreates).toHaveLength(1))
    expect(calls.contactCreates[0]?.contractorId).toBe(CONTRACTOR_IDS.alfa)
    expect(calls.contactCreates[0]?.body).toMatchObject({ email: 'novo@alfa.example.test' })
    rendered.unmount()
    restoreLayout()
  })

  test('quem só lê não vê a seção, e a API de contatos nem é chamada', async () => {
    const restoreLayout = stubVisibleLayout()
    const { calls, rendered } = await openFicha(false, { contacts: [ALFA_CONTACT] })

    expect(document.body.textContent?.includes('Contatos de ocorrência')).toBe(false)
    expect(calls.contactLists).toEqual([])
    rendered.unmount()
    restoreLayout()
  })
})

describe('os avisos da aba de e-mail com contratantes (spec 268 RF8)', () => {
  async function renderSummary() {
    return renderWithQueryClient(
      createElement(MailSendReadinessSummary, { companyId: 'company-1', enabled: true }),
    )
  }

  test('sem configuração e sem sandbox, avisa que nenhum e-mail de ocorrência sai', async () => {
    installContractorMailDouble({ read: { sandboxDelivery: false, summary: null } })
    const rendered = await renderSummary()

    await waitFor(() => expect(document.body.textContent).toContain(NO_MAIL_NOTICE))
    expect(document.body.textContent?.includes(SANDBOX_NOTICE)).toBe(false)
    rendered.unmount()
  })

  test('com o ambiente em modo de teste, avisa do Mailpit e não diz que nada sai', async () => {
    installContractorMailDouble({ read: { sandboxDelivery: true, summary: null } })
    const rendered = await renderSummary()

    await waitFor(() => expect(document.body.textContent).toContain(SANDBOX_NOTICE))
    expect(document.body.textContent?.includes(NO_MAIL_NOTICE)).toBe(false)
    rendered.unmount()
  })

  test('com o Resend pronto não mostra nenhum dos dois avisos', async () => {
    installContractorMailDouble({
      read: { sandboxDelivery: false, summary: VERIFIED_SETTINGS },
    })
    const rendered = await renderSummary()

    await waitFor(() => expect(document.body.textContent).toContain('Pronto para enviar'))
    expect(document.body.textContent?.includes(NO_MAIL_NOTICE)).toBe(false)
    expect(document.body.textContent?.includes(SANDBOX_NOTICE)).toBe(false)
    rendered.unmount()
  })
})

describe('o atalho dos contatos na aba de e-mail (spec 268 RF11)', () => {
  test('a dica leva à aba Contratantes', async () => {
    installContractorMailDouble()
    let opened = 0
    const rendered = await renderWithQueryClient(
      createElement(ContractorContactsPanel, {
        isDisabled: false,
        onOpenContractors: () => {
          opened += 1
        },
      }),
    )

    await waitFor(() => expect(document.body.textContent).toContain('fica na ficha dela'))
    await click(buttonByText('Abrir a aba Contratantes'))

    expect(opened).toBe(1)
    rendered.unmount()
  })
})
