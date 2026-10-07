/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10, `security.md` §1/§4/§8): a seção "Prévia por e-mail" da ficha do contratante
 * montada de verdade. O estado (sem endereço × ativo desde), as duas listas com erro por entrada, gerar e
 * rotacionar com confirmação, o endereço que aparece UMA vez (e só na memória do componente) e as recusas
 * recentes com motivo traduzido. Dados sintéticos: endereços `@exemplo.test`.
 */
import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { PreviewEmailPanel } from '@/modules/delivery-clients/components/PreviewEmailPanel.component'
import { ContractorDirectoryRequestError } from '@/modules/delivery-clients/shared/contractorDirectoryRequest.service'
import { PREVIEW_EMAIL_REASON_CODES } from '@/modules/delivery-clients/shared/previewEmail.types'

import { stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  ACTIVE_SETTINGS,
  ALL_REASON_INTAKES,
  ENTRY_DOMAIN,
  FILLED_SETTINGS,
  FIRST_TOKEN,
  installPreviewEmailDouble,
  type PreviewEmailDoubleInitial,
  PREVIEW_EMAIL_CONTRACTOR_ID,
  PREVIEW_ID,
  previewEmailFakes,
  SECOND_TOKEN,
} from './previewEmailHarness.helper'
import {
  buttonByText,
  click,
  describedBy,
  fieldByLabel,
  maybeButtonByText,
  typeInto,
} from './contractorDirectoryHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

let restoreLayout: () => void
let originalClipboard: PropertyDescriptor | undefined
const written: string[] = []

function bodyText(): string {
  return document.body.textContent ?? ''
}

async function openPanel(options: PreviewEmailDoubleInitial = {}) {
  const calls = installPreviewEmailDouble(options)
  const rendered = await renderWithQueryClient(
    createElement(PreviewEmailPanel, { contractorId: PREVIEW_EMAIL_CONTRACTOR_ID }),
  )
  await waitFor(() => expect(bodyText().includes('Prévia por e-mail')).toBe(true))
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]') === null).toBe(true))
  return { calls, rendered }
}

/** Chaves e valores guardados; um armazenamento dublado por outro teste, sem `length`, não guarda nada para ler. */
function storedValues(storage: Storage): string[] {
  const values: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key !== null) values.push(key, storage.getItem(key) ?? '')
  }
  return values
}

function refusalButtons(): string[] {
  const summary = document.querySelector('[data-refusal-summary]')
  return [...(summary?.querySelectorAll('button') ?? [])].map((button) => button.textContent ?? '')
}

/**
 * ⚠️ Os ganchos moram DENTRO de cada `describe`: este arquivo é importado por `trip-hooks.contract.test.ts` junto
 * com todos os outros, e um `beforeEach`/`afterEach` de topo valeria para a suíte inteira.
 */
function installPanelHooks(): void {
  beforeEach(() => {
    document.body.innerHTML = ''
    written.length = 0
    restoreLayout = stubVisibleLayout()
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text)
          return Promise.resolve()
        },
      },
    })
  })

  afterEach(() => {
    restoreLayout()
    if (originalClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard')
    else Object.defineProperty(navigator, 'clipboard', originalClipboard)
  })
}

describe('o estado do endereço de entrada (spec 237 T4.6b)', () => {
  installPanelHooks()

  test('sem endereço: diz que não há, as listas vêm vazias e gerar espera as listas gravadas', async () => {
    const { rendered } = await openPanel()

    expect(bodyText()).toContain('Sem endereço de entrada')
    expect(fieldByLabel('Quem encaminha').value).toBe('')
    expect(fieldByLabel('Remetente original do contratante').value).toBe('')
    expect(buttonByText('Gerar endereço').disabled).toBe(true)
    expect(bodyText()).toContain('Preencha e salve as duas listas')
    rendered.unmount()
  })

  test('listas gravadas e sem endereço: gerar fica liberado', async () => {
    const { rendered } = await openPanel({ settings: FILLED_SETTINGS })

    expect(fieldByLabel('Quem encaminha').value).toBe('equipe@transportadora.exemplo.test')
    expect(fieldByLabel('Remetente original do contratante').value).toBe('contratante.exemplo.test')
    expect(buttonByText('Gerar endereço').disabled).toBe(false)
    rendered.unmount()
  })

  test('endereço ativo: mostra desde quando, nunca o token, e o botão vira "Gerar novo endereço"', async () => {
    const { rendered } = await openPanel({ settings: ACTIVE_SETTINGS })

    expect(bodyText()).toContain('Endereço ativo desde')
    expect(bodyText()).toContain(
      new Date(ACTIVE_SETTINGS.inboundTokenSetAt ?? '').toLocaleDateString('pt-BR'),
    )
    expect(maybeButtonByText('Gerar novo endereço')).toBeDefined()
    expect(maybeButtonByText('Gerar endereço')).toBeUndefined()
    expect(bodyText().includes(FIRST_TOKEN)).toBe(false)
    expect(bodyText().includes(ENTRY_DOMAIN)).toBe(false)
    rendered.unmount()
  })

  test('explica que o encaminhamento é manual e que o automático não é suportado', async () => {
    const { rendered } = await openPanel()

    expect(bodyText()).toContain('encaminha à mão')
    expect(bodyText()).toContain('Encaminhamento automático')
    expect(bodyText()).toContain('não é suportado')
    rendered.unmount()
  })
})

describe('editar as duas listas (spec 237 T4.6b)', () => {
  installPanelHooks()

  test('entrada inválida é nomeada no campo, e nada vai à rede', async () => {
    const { calls, rendered } = await openPanel({ settings: FILLED_SETTINGS })

    await typeInto(fieldByLabel('Quem encaminha'), 'equipe@transportadora.exemplo.test\nsem-arroba')
    await click(buttonByText('Salvar listas'))

    const field = fieldByLabel('Quem encaminha')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(field)).toContain('sem-arroba')
    expect(calls.saves).toHaveLength(0)
    rendered.unmount()
  })

  /** Revisão de segurança (L3): o erro nomeia a entrada, mas nunca desenha bidi ou zero-width — a mensagem não se embaralha. */
  test('entrada com bidi ou zero-width é recusada e o erro a mostra sem o caractere oculto', async () => {
    const { calls, rendered } = await openPanel({ settings: FILLED_SETTINGS })

    await typeInto(
      fieldByLabel('Remetente original do contratante'),
      'acme.com\u202E\na\u200Bcme.com',
    )
    await click(buttonByText('Salvar listas'))

    const message = describedBy(fieldByLabel('Remetente original do contratante'))
    expect(message).toContain('ASCII')
    expect(message).toContain('acme.com?')
    expect(message).toContain('a?cme.com')
    expect(message.includes('\u202E') || message.includes('\u200B')).toBe(false)
    expect(calls.saves).toHaveLength(0)
    rendered.unmount()
  })

  test('mais de 20 entradas diferentes é recusado no campo', async () => {
    const { calls, rendered } = await openPanel()
    const twentyOne = Array.from(
      { length: 21 },
      (_, index) => `pessoa${index}@transportadora.exemplo.test`,
    )

    await typeInto(fieldByLabel('Quem encaminha'), twentyOne.join('\n'))
    await click(buttonByText('Salvar listas'))

    expect(describedBy(fieldByLabel('Quem encaminha'))).toContain('20')
    expect(calls.saves).toHaveLength(0)
    rendered.unmount()
  })

  test('grava as duas listas normalizadas e o campo passa a mostrar o que foi gravado', async () => {
    const { calls, rendered } = await openPanel()

    await typeInto(
      fieldByLabel('Quem encaminha'),
      '  Equipe@Transportadora.Exemplo.Test\n\nEQUIPE@transportadora.exemplo.test',
    )
    await typeInto(fieldByLabel('Remetente original do contratante'), 'Contratante.Exemplo.Test')
    await click(buttonByText('Salvar listas'))
    await settle()

    expect(calls.saves).toEqual([
      {
        contractorId: PREVIEW_EMAIL_CONTRACTOR_ID,
        lists: {
          forwarderAllowlist: ['equipe@transportadora.exemplo.test'],
          senderAllowlist: ['contratante.exemplo.test'],
        },
      },
    ])
    await waitFor(() => expect(bodyText()).toContain('Listas salvas'))
    expect(fieldByLabel('Quem encaminha').value).toBe('equipe@transportadora.exemplo.test')
    rendered.unmount()
  })

  test('a recusa do servidor nomeia TODOS os campos, e cada nome leva o foco ao campo', async () => {
    const { rendered } = await openPanel({ settings: FILLED_SETTINGS })
    await typeInto(fieldByLabel('Quem encaminha'), 'outra@transportadora.exemplo.test')
    previewEmailFakes.saveFailure = new ContractorDirectoryRequestError('VALIDATION_ERROR', [
      { field: 'forwarderAllowlist.0', message: 'x' },
      { field: 'senderAllowlist', message: 'y' },
    ])

    await click(buttonByText('Salvar listas'))
    await settle()

    await waitFor(() =>
      expect(refusalButtons()).toEqual(['Quem encaminha', 'Remetente original do contratante']),
    )
    await click(maybeButtonByTextIn(refusalButtons()[1] ?? '') as HTMLElement)
    expect(document.activeElement === fieldByLabel('Remetente original do contratante')).toBe(true)
    rendered.unmount()
  })
})

function maybeButtonByTextIn(text: string): HTMLButtonElement | undefined {
  const summary = document.querySelector('[data-refusal-summary]')
  return [...(summary?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === text,
  )
}

describe('gerar o endereço de entrada (spec 237 T4.6b)', () => {
  installPanelHooks()

  test('a primeira vez não pede confirmação: mostra o endereço inteiro, copiar e o aviso de uma vez só', async () => {
    const { calls, rendered } = await openPanel({ settings: FILLED_SETTINGS })

    await click(buttonByText('Gerar endereço'))
    await settle()

    expect(calls.generations).toEqual([PREVIEW_EMAIL_CONTRACTOR_ID])
    await waitFor(() => expect(bodyText()).toContain(`${FIRST_TOKEN}@${ENTRY_DOMAIN}`))
    expect(bodyText()).toContain('Mostrado só agora')
    expect(bodyText()).toContain('não será exibido de novo')
    expect(bodyText()).toContain('MX')
    await click(document.querySelector('button[aria-label="Copiar endereço"]') as HTMLElement)
    expect(written).toEqual([`${FIRST_TOKEN}@${ENTRY_DOMAIN}`])
    await waitFor(() => expect(bodyText()).toContain('Endereço ativo desde'))
    rendered.unmount()
  })

  test('fechar o painel apaga o endereço da tela e da memória do componente', async () => {
    const { rendered } = await openPanel({ settings: FILLED_SETTINGS })
    await click(buttonByText('Gerar endereço'))
    await waitFor(() => expect(bodyText()).toContain(FIRST_TOKEN))

    await click(buttonByText('Fechar'))

    await waitFor(() => expect(bodyText().includes(FIRST_TOKEN)).toBe(false))
    const remembered = rendered.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => JSON.stringify(mutation.state.data ?? null))
    expect(remembered.some((value) => value.includes(FIRST_TOKEN))).toBe(false)
    rendered.unmount()
  })

  test('o endereço nunca vai para o armazenamento do navegador, a URL nem o console', async () => {
    const logs = [
      spyOn(console, 'log'),
      spyOn(console, 'info'),
      spyOn(console, 'debug'),
      spyOn(console, 'warn'),
      spyOn(console, 'error'),
    ]
    const { rendered } = await openPanel({ settings: FILLED_SETTINGS })

    try {
      await click(buttonByText('Gerar endereço'))
      await waitFor(() => expect(bodyText()).toContain(FIRST_TOKEN))

      const stored = [window.localStorage, window.sessionStorage].flatMap(storedValues)
      expect(stored.some((value) => value.includes(FIRST_TOKEN))).toBe(false)
      expect(window.location.href.includes(FIRST_TOKEN)).toBe(false)
      const printed = logs.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)))
      expect(printed.some((line) => line.includes(FIRST_TOKEN))).toBe(false)
    } finally {
      for (const spy of logs) spy.mockRestore()
      rendered.unmount()
    }
  })

  /**
   * Revisão de segurança (i6): sair da ficha com o endereço aberto também o apaga da memória — o cache de mutações (`gcTime: 0`) não
   * guarda o resultado de quem já nem observa. A ficha fecha a seção como este anfitrião: o `QueryClient` segue vivo.
   */
  test('sair da ficha com o endereço aberto o apaga da tela e do cache de mutações', async () => {
    function Host() {
      const [isOpen, setIsOpen] = useState(true)
      return createElement(
        'div',
        null,
        createElement(
          'button',
          { onClick: () => setIsOpen(false), type: 'button' },
          'Sair da ficha',
        ),
        isOpen
          ? createElement(PreviewEmailPanel, { contractorId: PREVIEW_EMAIL_CONTRACTOR_ID })
          : null,
      )
    }
    installPreviewEmailDouble({ settings: FILLED_SETTINGS })
    const rendered = await renderWithQueryClient(createElement(Host))
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]') === null).toBe(true))
    await click(buttonByText('Gerar endereço'))
    await waitFor(() => expect(bodyText()).toContain(FIRST_TOKEN))

    await click(buttonByText('Sair da ficha'))

    await waitFor(() => expect(bodyText().includes(FIRST_TOKEN)).toBe(false))
    await waitFor(() =>
      expect(
        rendered.queryClient
          .getMutationCache()
          .getAll()
          .some((mutation) => JSON.stringify(mutation.state.data ?? null).includes(FIRST_TOKEN)),
      ).toBe(false),
    )
    rendered.unmount()
  })

  test('rotacionar pede confirmação: nada vai à rede antes dela, e cancelar não gera', async () => {
    const { calls, rendered } = await openPanel({ settings: ACTIVE_SETTINGS })

    await click(buttonByText('Gerar novo endereço'))
    expect(bodyText()).toContain('O endereço anterior deixa de valer')
    expect(calls.generations).toHaveLength(0)

    await click(buttonByText('Cancelar'))
    await waitFor(() =>
      expect(bodyText().includes('O endereço anterior deixa de valer')).toBe(false),
    )
    expect(calls.generations).toHaveLength(0)

    await click(buttonByText('Gerar novo endereço'))
    await click(buttonByText('Sim, gerar novo endereço'))
    await settle()
    expect(calls.generations).toEqual([PREVIEW_EMAIL_CONTRACTOR_ID])
    await waitFor(() => expect(bodyText()).toContain(`${FIRST_TOKEN}@${ENTRY_DOMAIN}`))
    rendered.unmount()
  })

  test('uma segunda rotação mostra o endereço novo e o anterior já não está na tela', async () => {
    const { rendered } = await openPanel({ settings: ACTIVE_SETTINGS })
    await click(buttonByText('Gerar novo endereço'))
    await click(buttonByText('Sim, gerar novo endereço'))
    await waitFor(() => expect(bodyText()).toContain(FIRST_TOKEN))
    await click(buttonByText('Fechar'))
    await waitFor(() => expect(maybeButtonByText('Gerar novo endereço') !== undefined).toBe(true))

    await click(buttonByText('Gerar novo endereço'))
    await click(buttonByText('Sim, gerar novo endereço'))
    await waitFor(() => expect(bodyText()).toContain(SECOND_TOKEN))

    expect(bodyText().includes(FIRST_TOKEN)).toBe(false)
    rendered.unmount()
  })

  test.each([
    ['RECEIVING_PROFILE_ALLOWLISTS_REQUIRED', 'Preencha as duas listas'],
    ['RECEIVING_PROFILE_INBOUND_DOMAIN_NOT_CONFIGURED', 'domínio de entrada de e-mail'],
    ['TOO_MANY_REQUESTS', 'Muitas tentativas'],
    ['ALGO_INESPERADO', 'Não foi possível gerar o endereço'],
  ])('a recusa %s é explicada, e nenhum endereço aparece', async (code, expected) => {
    const { rendered } = await openPanel({ settings: FILLED_SETTINGS })
    previewEmailFakes.generateFailure = new ContractorDirectoryRequestError(code)

    await click(buttonByText('Gerar endereço'))
    await settle()

    await waitFor(() => expect(bodyText()).toContain(expected))
    expect(bodyText().includes('@' + ENTRY_DOMAIN)).toBe(false)
    rendered.unmount()
  })
})

describe('as recusas recentes (spec 237 T4.6b)', () => {
  installPanelHooks()

  test('uma linha por e-mail, com o motivo traduzido para TODOS os códigos e o link da prévia aceita', async () => {
    const { rendered } = await openPanel({ intakes: ALL_REASON_INTAKES, settings: ACTIVE_SETTINGS })
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(17))

    const text = bodyText()
    for (const code of PREVIEW_EMAIL_REASON_CODES) expect(text.includes(code)).toBe(false)
    const reasonCells = [...document.querySelectorAll('td[data-label="Motivo"]')].map(
      (cell) => cell.textContent ?? '',
    )
    expect(new Set(reasonCells.filter((reason) => reason !== '—')).size).toBe(16)
    const link = document.querySelector<HTMLAnchorElement>(
      `a[href="/recebimento/previas/${PREVIEW_ID}"]`,
    )
    expect(link?.textContent).toBe('Abrir prévia')
    expect(document.querySelectorAll('a[href^="/recebimento/previas/"]')).toHaveLength(1)
    rendered.unmount()
  })

  test('as células levam o rótulo da coluna, para a tabela virar cartão no celular', async () => {
    const { rendered } = await openPanel({ intakes: ALL_REASON_INTAKES })
    await waitFor(() => expect(document.querySelectorAll('tbody tr').length).toBe(17))

    const labels = [...document.querySelectorAll('tbody tr:first-child td')].map((cell) =>
      cell.getAttribute('data-label'),
    )
    expect(labels).toEqual(['Data', 'Resultado', 'Motivo', 'Prévia'])
    rendered.unmount()
  })

  test('sem e-mail recebido, diz isso em vez de mostrar uma tabela vazia', async () => {
    const { rendered } = await openPanel()

    await waitFor(() => expect(bodyText()).toContain('Nenhum e-mail recebido ainda'))
    expect(document.querySelectorAll('table')).toHaveLength(0)
    rendered.unmount()
  })
})
