/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 298 (revisão da Fase 3, M4): "Importar por bip" é achável na página de NF-e — rótulo da
 * origem, atalho visível e mensagem de permissão em vez de tela vazia.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'bun:test'

import '../../src/modules/shared/i18n/i18n.service'
import { AccessKeyImportSection } from '../../src/modules/nfe-workspace/components/AccessKeyImportSection.component'
import { NfeImportByScanShortcut } from '../../src/modules/nfe-workspace/components/NfeImportByScanShortcut.component'
import enLocale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'
import ptLocale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import { readNfeImportMechanismFromSearch } from '../../src/modules/nfe-workspace/shared/nfeImportMechanism.service'

let root: Root | undefined
let container: HTMLElement | undefined

function mount(element: ReturnType<typeof createElement>): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(element))
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe('importar por bip na página de NF-e', () => {
  it('a origem se chama "Importar por bip" em pt-BR e "Import by scan" em en', () => {
    expect(ptLocale.mechanism.accessKey).toBe('Importar por bip')
    expect(enLocale.mechanism.accessKey).toBe('Import by scan')
  })

  it('o atalho existe com permissão de importar e abre a origem ao clicar', () => {
    let opened = 0
    const view = mount(
      createElement(NfeImportByScanShortcut, {
        canImport: true,
        onOpen: () => {
          opened += 1
        },
      }),
    )
    const button = view.querySelector('button')
    expect(button?.textContent).toBe('Importar por bip')

    act(() => button?.click())
    expect(opened).toBe(1)
  })

  it('sem permissão de importar o atalho não aparece', () => {
    const view = mount(
      createElement(NfeImportByScanShortcut, { canImport: false, onOpen: () => undefined }),
    )

    expect(view.querySelector('button')).toBeNull()
  })

  it('sem permissão a origem mostra uma mensagem curta, não uma tela vazia', () => {
    const view = mount(
      createElement(AccessKeyImportSection, { canImport: false, onOpenDocument: () => undefined }),
    )

    expect(view.querySelector('[role="status"]')?.textContent).toBe(
      'Você não tem permissão para importar notas.',
    )
    expect(view.querySelector('input')).toBeNull()
  })

  it('?origin=accessKey abre a origem; valor desconhecido cai na remota', () => {
    expect(readNfeImportMechanismFromSearch('?tab=imports&origin=accessKey')).toBe('accessKey')
    expect(readNfeImportMechanismFromSearch('?origin=inventada')).toBe('remote')
    expect(readNfeImportMechanismFromSearch('')).toBe('remote')
  })
})
