/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.4 (RF9, `web.md` §7): a lista de contratantes montada de verdade — o selo lido do perfil,
 * a busca, a ordenação por cabeçalho (asc → desc → neutro), o filtro de situação, o "limpar filtros"
 * que só existe com critério aplicado e o estado todo na URL. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import {
  buttonByText,
  click,
  fieldByLabel,
  installContractorDirectoryDouble,
  maybeButtonByText,
  resetLocation,
  rowNames,
  typeInto,
} from './contractorDirectoryHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'
import { ContractorDirectoryPanel } from '@/modules/delivery-clients/components/ContractorDirectoryPanel.component'

const ALL_NAMES = [
  'Alfa Indústria Fictícia',
  'Beta Comércio Fictício',
  'Gama Distribuidora Fictícia',
  'Delta Atacado Fictício',
]

async function mountList(search = '') {
  resetLocation(search)
  installContractorDirectoryDouble()
  const rendered = await renderWithQueryClient(
    createElement(ContractorDirectoryPanel, { canManage: true }),
  )
  await waitFor(() => expect(rowNames().length).toBeGreaterThan(0))
  return rendered
}

function headerOf(label: string): HTMLTableCellElement {
  const header = [...document.querySelectorAll('thead th')].find((cell) =>
    (cell.textContent ?? '').trim().startsWith(label),
  )
  if (header === undefined) throw new Error(`HEADER_NOT_FOUND:${label}`)
  return header as HTMLTableCellElement
}

function currentParameters(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a lista de contratantes (spec 237 T1.4)', () => {
  test('mostra nome, CNPJ formatado e o selo que o perfil de cada um diz', async () => {
    const rendered = await mountList()
    await waitFor(() => expect(document.body.textContent).not.toContain('Lendo o perfil'))

    expect(rowNames()).toEqual(ALL_NAMES)
    const rows = [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')
    expect(rows[0]).toContain('11.222.333/0001-81')
    expect(rows[0]).toContain('Recebimento ativo')
    expect(rows[1]).toContain('Recebimento desligado')
    expect(rows[2]).toContain('Sem perfil')
    expect(rows[3]).toContain('Sem perfil')
    rendered.unmount()
  })

  test('as linhas alternam por classe, nunca por estilo inline', async () => {
    const rendered = await mountList()

    expect(document.querySelectorAll('tbody tr[style]')).toHaveLength(0)
    expect(document.querySelector('table')?.className).not.toBe('')
    rendered.unmount()
  })

  test('a busca filtra por nome ou CNPJ e vai para a URL; apagar tira da URL', async () => {
    const rendered = await mountList()
    const search = fieldByLabel('Buscar')

    await typeInto(search, 'gama')
    expect(rowNames()).toEqual(['Gama Distribuidora Fictícia'])
    expect(currentParameters().get('q')).toBe('gama')
    expect(currentParameters().get('tab')).toBe('contractors')

    await typeInto(search, '22.333.444/0001-62')
    expect(rowNames()).toEqual(['Beta Comércio Fictício'])

    await typeInto(search, '')
    expect(rowNames()).toEqual(ALL_NAMES)
    expect(currentParameters().has('q')).toBe(false)
    rendered.unmount()
  })

  test('busca sem resposta diz que nenhum contratante tem esses filtros', async () => {
    const rendered = await mountList()

    await typeInto(fieldByLabel('Buscar'), 'inexistente')
    expect(rowNames()).toEqual([])
    expect(document.body.textContent).toContain('Nenhum contratante com esses filtros.')
    rendered.unmount()
  })

  test('"Limpar filtros" só aparece com critério aplicado e devolve a lista inteira', async () => {
    const rendered = await mountList()
    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()

    await typeInto(fieldByLabel('Buscar'), 'gama')
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()

    await click(buttonByText('Limpar filtros'))
    expect(rowNames()).toEqual(ALL_NAMES)
    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()
    expect(currentParameters().has('q')).toBe(false)
    rendered.unmount()
  })

  test('o cabeçalho alterna ascendente, descendente e neutro, e a URL acompanha', async () => {
    const rendered = await mountList()
    const nameButton = () => headerOf('Nome').querySelector('button') as HTMLButtonElement
    expect(headerOf('Nome').getAttribute('aria-sort')).toBe('none')

    await click(nameButton())
    expect(headerOf('Nome').getAttribute('aria-sort')).toBe('ascending')
    expect(rowNames()).toEqual([
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
      'Delta Atacado Fictício',
      'Gama Distribuidora Fictícia',
    ])
    expect(currentParameters().get('sort')).toBe('name')
    expect(currentParameters().get('dir')).toBe('asc')

    await click(nameButton())
    expect(headerOf('Nome').getAttribute('aria-sort')).toBe('descending')
    expect(rowNames()[0]).toBe('Gama Distribuidora Fictícia')
    expect(currentParameters().get('dir')).toBe('desc')

    await click(nameButton())
    expect(headerOf('Nome').getAttribute('aria-sort')).toBe('none')
    expect(rowNames()).toEqual(ALL_NAMES)
    expect(currentParameters().has('sort')).toBe(false)
    rendered.unmount()
  })

  test('a URL reabre a lista filtrada: situação inativa mostra só o inativo', async () => {
    const rendered = await mountList('?tab=contractors&status=inactive')

    expect(rowNames()).toEqual(['Delta Atacado Fictício'])
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()
    expect(document.body.textContent).toContain('1 de 4 contratantes')
    rendered.unmount()
  })

  test('o filtro de situação aceita seleção múltipla', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Situação"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Ativo', 'Inativo'])

    await click(options[1] as HTMLElement)
    await click(options[0] as HTMLElement)
    expect(rowNames()).toEqual(ALL_NAMES)
    expect(currentParameters().get('status')).toBe('inactive,active')
    rendered.unmount()
  })

  test('abrir a ficha de uma linha revela o painel e não perde o filtro', async () => {
    const rendered = await mountList()
    await typeInto(fieldByLabel('Buscar'), 'alfa')

    await click(
      document.querySelector(
        'button[aria-label="Abrir a ficha de Alfa Indústria Fictícia"]',
      ) as HTMLElement,
    )
    await settle()

    expect(document.querySelector('section[aria-labelledby]')).not.toBeNull()
    expect(rowNames()).toEqual(['Alfa Indústria Fictícia'])
    rendered.unmount()
  })
})
