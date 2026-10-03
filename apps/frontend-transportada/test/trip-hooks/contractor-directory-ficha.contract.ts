/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.4 (RF1, RF9, `web.md` §11): a ficha do contratante montada de verdade — dados que o
 * `PATCH` aceita e perfil de recebimento. O `PUT` leva todas as chaves; a recusa do servidor nomeia
 * TODOS os campos, cada nome é um atalho que leva o foco ao campo, e o silêncio vale quando a falha
 * não aponta campo. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { ContractorDirectoryPanel } from '@/modules/delivery-clients/components/ContractorDirectoryPanel.component'
import { ContractorDirectoryRequestError } from '@/modules/delivery-clients/shared/contractorDirectoryRequest.service'
import { RECEIVING_PROFILE_RULE_KEYS } from '@/modules/delivery-clients/shared/receivingProfile.types'

import {
  buttonByText,
  click,
  contractorDirectoryFakes,
  CONTRACTOR_IDS,
  describedBy,
  fieldByLabel,
  installContractorDirectoryDouble,
  maybeButtonByText,
  resetLocation,
  rowNames,
  typeInto,
} from './contractorDirectoryHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function openFicha(contractorName: string, options: Readonly<{ canManage?: boolean }> = {}) {
  resetLocation()
  const calls = installContractorDirectoryDouble()
  const rendered = await renderWithQueryClient(
    createElement(ContractorDirectoryPanel, { canManage: options.canManage ?? true }),
  )
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
  await click(
    document.querySelector(
      `button[aria-label="Abrir a ficha de ${contractorName}"]`,
    ) as HTMLElement,
  )
  await waitFor(() => expect(document.body.textContent).toContain('Perfil de recebimento'))
  await waitFor(() => expect(document.body.textContent).not.toContain('Carregando o perfil'))
  return { calls, rendered }
}

function checkboxByLabel(labelText: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find((element) =>
    (element.textContent ?? '').includes(labelText),
  )
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (input === undefined || input === null) throw new Error(`CHECKBOX_NOT_FOUND:${labelText}`)
  return input
}

/** Comparação booleana: `toBe` sobre nó do DOM não reprovou aqui, e foco é exatamente o que se prova. */
function isFocused(element: HTMLElement): boolean {
  return document.activeElement === element
}

function refusalButtons(): string[] {
  const summary = [...document.querySelectorAll('[data-refusal-summary]')][0]
  return [...(summary?.querySelectorAll('button') ?? [])].map((button) => button.textContent ?? '')
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a ficha do contratante: dados e perfil', () => {
  test('abre com o nome, o CNPJ em texto e os dados gravados; o CNPJ não é campo', async () => {
    const { rendered } = await openFicha('Alfa Indústria Fictícia')

    expect(document.querySelector('h3')?.textContent).toContain('Alfa Indústria Fictícia')
    expect(document.body.textContent).toContain('CNPJ 11.222.333/0001-81')
    expect(fieldByLabel('Nome de exibição').value).toBe('Alfa Indústria Fictícia')
    expect(fieldByLabel('E-mail do relatório').value).toBe('relatorio@alfa.example.test')
    expect(fieldByLabel('Observações').value).toBe('Observação sintética')
    const inputValues = [...document.querySelectorAll('input')].map((input) => input.value)
    expect(inputValues.some((value) => value.includes('11222333000181'))).toBe(false)
    rendered.unmount()
  })

  test('abre o perfil gravado: janela, prazo, aba e as colunas já mapeadas', async () => {
    const { rendered } = await openFicha('Alfa Indústria Fictícia')

    expect(checkboxByLabel('Recebimento ligado').checked).toBe(true)
    expect(fieldByLabel('Janela de separação (horas)').value).toBe('24')
    expect(fieldByLabel('Prazo de entrega (dias úteis)').value).toBe('3')
    expect(fieldByLabel('Janela de vínculo (dias)').value).toBe('15')
    expect(fieldByLabel('Nome da aba').value).toBe('Aba Sintética')
    expect(fieldByLabel('Roteiro').value).toBe('Coluna A')
    expect(fieldByLabel('Valor').value).toBe('Coluna B')
    rendered.unmount()
  })

  test('contratante sem perfil abre com os padrões, e o mapa só aparece com a prévia ligada', async () => {
    const { rendered } = await openFicha('Gama Distribuidora Fictícia')

    expect(checkboxByLabel('Recebimento ligado').checked).toBe(false)
    expect(fieldByLabel('Janela de vínculo (dias)').value).toBe('15')
    expect(fieldByLabel('Tolerância do peso (%)').value).toBe('0')
    expect(fieldByLabel('Janela de separação (horas)').value).toBe('')
    expect(document.body.textContent).not.toContain('Referência do contratante')

    await click(checkboxByLabel('Receber prévia da planilha'))
    expect(fieldByLabel('Referência do contratante').value).toBe('')
    expect(fieldByLabel('Data do roteiro').value).toBe('')
    expect(document.querySelectorAll('input[data-field^="previewColumnMap."]')).toHaveLength(13)
    rendered.unmount()
  })

  test('os textos de ajuda não prometem o que ainda não existe', async () => {
    const { rendered } = await openFicha('Alfa Indústria Fictícia')
    const text = document.body.textContent ?? ''

    expect(text).toContain('Horas, a partir da chegada, para separar a carga e abrir avarias')
    expect(text).toContain('Dias úteis, desde a chegada, para entregar')
    expect(text).toContain('painel de prazos quando ele estiver disponível')
    rendered.unmount()
  })
})

describe('salvar o perfil: o PUT leva todas as chaves', () => {
  test('edita a janela e grava o perfil inteiro, com null onde não há regra', async () => {
    const { calls, rendered } = await openFicha('Gama Distribuidora Fictícia')

    await typeInto(fieldByLabel('Janela de separação (horas)'), '48')
    await click(buttonByText('Salvar perfil'))
    await settle()

    expect(calls.profileSaves).toHaveLength(1)
    const saved = calls.profileSaves[0]
    expect(saved?.contractorId).toBe(CONTRACTOR_IDS.gama)
    expect(Object.keys(saved?.rules ?? {}).sort()).toEqual([...RECEIVING_PROFILE_RULE_KEYS].sort())
    expect(saved?.rules).toEqual({
      arrivalReferencePattern: null,
      deliveryDeadlineBusinessDays: null,
      isEnabled: false,
      matchWindowDays: 15,
      previewColumnMap: null,
      previewEnabled: false,
      previewSheetName: null,
      requiresDamageCheck: false,
      separationWindowHours: 48,
      weightTolerancePercent: 0,
    })
    await waitFor(() => expect(document.body.textContent).toContain('Perfil salvo.'))
    rendered.unmount()
  })

  test('limpar um campo opcional manda null, nunca zero', async () => {
    const { calls, rendered } = await openFicha('Alfa Indústria Fictícia')

    await typeInto(fieldByLabel('Prazo de entrega (dias úteis)'), '')
    await click(buttonByText('Salvar perfil'))
    await settle()

    expect(calls.profileSaves[0]?.rules.deliveryDeadlineBusinessDays).toBeNull()
    rendered.unmount()
  })

  test('faixa inválida não vai ao servidor e ancora o erro no campo (aria-invalid + describedby)', async () => {
    const { calls, rendered } = await openFicha('Gama Distribuidora Fictícia')
    const separation = fieldByLabel('Janela de separação (horas)')

    await typeInto(separation, '169')
    await click(buttonByText('Salvar perfil'))
    await settle()

    expect(calls.profileSaves).toHaveLength(0)
    expect(separation.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(separation)).toContain('Use um valor de 1 a 168.')

    await typeInto(separation, '24')
    expect(separation.getAttribute('aria-invalid')).not.toBe('true')
    expect(describedBy(separation)).not.toContain('Use um valor de 1 a 168.')
    rendered.unmount()
  })

  test('prévia ligada sem roteiro, valor e peso: cada coluna faltante é um campo recusado', async () => {
    const { calls, rendered } = await openFicha('Gama Distribuidora Fictícia')

    await click(checkboxByLabel('Receber prévia da planilha'))
    await click(buttonByText('Salvar perfil'))
    await settle()

    expect(calls.profileSaves).toHaveLength(0)
    expect(refusalButtons()).toEqual(['Roteiro', 'Valor', 'Peso (kg)'])
    expect(fieldByLabel('Valor').getAttribute('aria-invalid')).toBe('true')
    rendered.unmount()
  })
})

describe('a recusa do servidor nomeia o campo, e o nome é um atalho (web.md §11)', () => {
  const REFUSAL = new ContractorDirectoryRequestError('INVALID_REQUEST', [
    { field: 'matchWindowDays', message: 'Too small' },
    { field: 'separationWindowHours', message: 'Too big' },
    { field: 'separationWindowHours', message: 'Second rule' },
  ])

  async function saveRefused(error: Error) {
    const context = await openFicha('Gama Distribuidora Fictícia')
    contractorDirectoryFakes.saveFailure = error
    await typeInto(fieldByLabel('Janela de separação (horas)'), '24')
    await click(buttonByText('Salvar perfil'))
    await settle()
    return context
  }

  test('lista TODOS os campos recusados, sem repetir, pelo rótulo impresso', async () => {
    const { rendered } = await saveRefused(REFUSAL)

    expect(document.body.textContent).toContain('Confira:')
    expect(refusalButtons()).toEqual(['Janela de vínculo (dias)', 'Janela de separação (horas)'])
    expect(document.body.textContent).not.toContain('matchWindowDays')
    rendered.unmount()
  })

  test('clicar no nome leva o foco ao campo', async () => {
    const { rendered } = await saveRefused(REFUSAL)

    /** O último campo digitado já tem o foco: o atalho a provar é o de outro campo. */
    const shortcut = [...document.querySelectorAll('[data-refusal-summary] button')].find(
      (button) => button.textContent === 'Janela de vínculo (dias)',
    ) as HTMLElement
    expect(isFocused(fieldByLabel('Janela de vínculo (dias)'))).toBe(false)
    await click(shortcut)

    expect(isFocused(fieldByLabel('Janela de vínculo (dias)'))).toBe(true)
    rendered.unmount()
  })

  test('os campos recusados ficam marcados e editar um limpa só o dele', async () => {
    const { rendered } = await saveRefused(REFUSAL)
    const matchWindow = fieldByLabel('Janela de vínculo (dias)')
    const separation = fieldByLabel('Janela de separação (horas)')

    expect(matchWindow.getAttribute('aria-invalid')).toBe('true')
    expect(separation.getAttribute('aria-invalid')).toBe('true')

    await typeInto(matchWindow, '20')
    expect(matchWindow.getAttribute('aria-invalid')).not.toBe('true')
    expect(separation.getAttribute('aria-invalid')).toBe('true')
    expect(refusalButtons()).toEqual(['Janela de separação (horas)'])
    rendered.unmount()
  })

  test('campo desconhecido chega ao usuário com o nome cru, e continua sendo atalho', async () => {
    const { rendered } = await saveRefused(
      new ContractorDirectoryRequestError('INVALID_REQUEST', [
        { field: 'somethingNew', message: 'Unknown' },
        { field: 'matchWindowDays', message: 'Too small' },
      ]),
    )

    expect(refusalButtons()).toEqual(['somethingNew', 'Janela de vínculo (dias)'])
    rendered.unmount()
  })

  test('coluna recusada pelo servidor aparece pelo rótulo da coluna, e o atalho foca o campo dela', async () => {
    const context = await openFicha('Alfa Indústria Fictícia')
    contractorDirectoryFakes.saveFailure = new ContractorDirectoryRequestError('INVALID_REQUEST', [
      { field: 'previewColumnMap.value', message: 'Column is already mapped' },
    ])
    await click(buttonByText('Salvar perfil'))
    await settle()

    expect(refusalButtons()).toEqual(['Valor'])
    await click(document.querySelector('[data-refusal-summary] button') as HTMLElement)
    expect(isFocused(fieldByLabel('Valor'))).toBe(true)
    context.rendered.unmount()
  })

  test('falha sem campo nenhum: só o aviso com o código, sem lista "Confira"', async () => {
    const { rendered } = await saveRefused(new ContractorDirectoryRequestError('INTERNAL_ERROR'))

    expect(refusalButtons()).toEqual([])
    expect(document.body.textContent).not.toContain('Confira:')
    expect(document.body.textContent).toContain('Não foi possível salvar o perfil: INTERNAL_ERROR')
    rendered.unmount()
  })
})

describe('salvar os dados do contratante', () => {
  test('manda os cinco campos do PATCH e confirma', async () => {
    const { calls, rendered } = await openFicha('Alfa Indústria Fictícia')

    await typeInto(fieldByLabel('Nome de exibição'), 'Alfa Renomeada')
    await click(buttonByText('Salvar dados'))
    await settle()

    expect(calls.contractorUpdates).toEqual([
      {
        id: CONTRACTOR_IDS.alfa,
        values: {
          closingPeriod: 'monthly',
          displayName: 'Alfa Renomeada',
          notes: 'Observação sintética',
          reportEmail: 'relatorio@alfa.example.test',
          status: 'active',
        },
      },
    ])
    await waitFor(() => expect(document.body.textContent).toContain('Dados salvos.'))
    rendered.unmount()
  })

  test('e-mail sem forma de e-mail não vai ao servidor', async () => {
    const { calls, rendered } = await openFicha('Alfa Indústria Fictícia')
    const email = fieldByLabel('E-mail do relatório')

    await typeInto(email, 'sem-arroba')
    await click(buttonByText('Salvar dados'))
    await settle()

    expect(calls.contractorUpdates).toHaveLength(0)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(describedBy(email)).toContain('Informe um e-mail válido.')
    rendered.unmount()
  })
})

describe('quem só lê não altera', () => {
  test('sem permissão de configuração os campos ficam travados e não há botão de salvar', async () => {
    const { rendered } = await openFicha('Alfa Indústria Fictícia', { canManage: false })

    expect(fieldByLabel('Nome de exibição').disabled).toBe(true)
    expect(fieldByLabel('Janela de separação (horas)').disabled).toBe(true)
    expect(maybeButtonByText('Salvar perfil')).toBeUndefined()
    expect(maybeButtonByText('Salvar dados')).toBeUndefined()
    expect(document.body.textContent).toContain('só quem gerencia as configurações')
    rendered.unmount()
  })
})
