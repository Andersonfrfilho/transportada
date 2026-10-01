/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { canOpenWorkspace } from '@/modules/shared/workspaceAccess.service'

/**
 * Spec 221 RF-D2/RF-D3 (CA09). As três telas que não tinham parede agora decidem pelo **mesmo** mapa
 * do menu, e é essa a asserção que importa: a primeira versão destes contratos afirmava que a fonte
 * continha as palavras `isForbidden` e `t('forbidden')`, e passava verde com as três paredes
 * desligadas — medido por mutação em 2026-10-01. Afirmar conjunto de permissão pega o que afirmar
 * texto não pega.
 *
 * Permissões transcritas de `COMPANY_ROLE_PERMISSIONS`
 * (`api-transportada/src/identity/domain/authorization.policy.ts`).
 */
const SEPARATOR = ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage', 'cargo.measure']
const OPERATOR = [
  'invoices.read',
  'fleet.read',
  'fleet.manage',
  'trip.manage',
  'trip.financials',
  'nfse.read',
  'nfse.manage',
  'settings.manage',
]
const FINANCE = ['billing.create', 'billing.read', 'trip.financials', 'nfse.read']
const DRIVER = ['trip.read', 'trip.report']

const WALLED_PAGES = [
  {
    key: 'company-settings',
    path: 'src/modules/company-settings/pages/CompanySettings.page.tsx',
  },
  {
    key: 'nfse-invoice',
    path: 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx',
  },
  {
    key: 'extra-charges',
    path: 'src/modules/extra-charges/pages/ExtraChargeWorkspace.page.tsx',
  },
] as const

function readPage(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('as três paredes novas decidem pelo mapa do menu (spec 221 CA09)', () => {
  for (const page of WALLED_PAGES) {
    it(`${page.key} pergunta ao mapa, em vez de recalcular a permissão`, () => {
      const source = readPage(page.path)

      expect(source).toInclude("from '@/modules/shared/workspaceAccess.service'")
      expect(source).toInclude(`workspace: '${page.key}'`)
    })
  }

  it('o separador não abre nenhuma das três', () => {
    for (const page of WALLED_PAGES) {
      expect(canOpenWorkspace({ permissions: SEPARATOR, workspace: page.key })).toBe(false)
    }
  })

  it('o motorista não abre nenhuma das três', () => {
    for (const page of WALLED_PAGES) {
      expect(canOpenWorkspace({ permissions: DRIVER, workspace: page.key })).toBe(false)
    }
  })

  /**
   * Repasses é a parede que fecha exposição de verdade: a tela não tinha checagem nenhuma e a
   * consulta da lista não tinha `enabled`, então o separador lia as cobranças da empresa. A regra é a
   * permissão de dinheiro (D4) — `trip.manage`, que o separador tem, não serve.
   */
  it('Repasses abre para quem cuida de dinheiro, e só', () => {
    expect(canOpenWorkspace({ permissions: FINANCE, workspace: 'extra-charges' })).toBe(true)
    expect(canOpenWorkspace({ permissions: OPERATOR, workspace: 'extra-charges' })).toBe(true)
    expect(canOpenWorkspace({ permissions: ['trip.manage'], workspace: 'extra-charges' })).toBe(
      false,
    )
  })

  it('a consulta de Repasses morre com a parede — esconder o render não bastaria', () => {
    const source = readPage('src/modules/extra-charges/pages/ExtraChargeWorkspace.page.tsx')

    expect(source).toInclude('enabled: !isForbidden')
  })

  it('o operador mantém Empresa e NFS-e', () => {
    expect(canOpenWorkspace({ permissions: OPERATOR, workspace: 'company-settings' })).toBe(true)
    expect(canOpenWorkspace({ permissions: OPERATOR, workspace: 'nfse-invoice' })).toBe(true)
  })

  /** NFS-e tem duas abas: quem só configura a credencial da prefeitura abre pela segunda. */
  it('NFS-e abre para quem só configura', () => {
    expect(canOpenWorkspace({ permissions: ['settings.manage'], workspace: 'nfse-invoice' })).toBe(
      true,
    )
  })
})
