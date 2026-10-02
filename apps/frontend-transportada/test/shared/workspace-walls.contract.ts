/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { isWorkspaceForbidden } from '@/modules/shared/workspaceWall.service'

/**
 * Spec 221 RF-D2/RF-D3 (CA09). As três telas que não tinham parede decidem pela **mesma** função
 * pura do mapa, e é ela que este contrato exercita.
 *
 * ⚠️ Duas gerações deste arquivo já nasceram inúteis, e a lição é a mesma: asserção sobre o texto da
 * fonte não prende regra. A primeira afirmava que a página continha `isForbidden` e `t('forbidden')`
 * — passava verde com as três paredes desligadas. A segunda afirmava que ela continha
 * `canOpenWorkspace` e `workspace: '<chave>'` — passava verde com o `!` invertido, que abre a tela
 * exatamente para quem não pode. Só afirmar **comportamento** derruba as duas mutações.
 *
 * Permissões transcritas de `COMPANY_ROLE_PERMISSIONS`
 * (`api-transportada/src/identity/domain/authorization.policy.ts`).
 */
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

const SEPARATOR = ['invoices.read', 'fleet.read', 'trip.read', 'trip.manage', 'cargo.measure']
const DRIVER = ['trip.read', 'trip.report']
/** `authorization.policy.ts:192` — o operador **não** tem `settings.manage` nem `billing.create`. */
const OPERATOR = [
  'invoices.import',
  'invoices.read',
  'batches.create',
  'freight.simulate',
  'cte.manage',
  'cte.submit',
  'cte.read',
  'operations.read',
  'addresses.read',
  'fleet.read',
  'fleet.manage',
  'mdfe.read',
  'mdfe.manage',
  'nfse.manage',
  'nfse.read',
  'trip.manage',
  'trip.report-on-behalf',
  'trip.financials',
  'cargo.measure',
  'occurrences.resolve',
]
const FINANCE = [
  'cte.read',
  'trip.report-on-behalf',
  'trip.financials',
  'billing.create',
  'billing.cancel',
  'billing.read',
  'operations.read',
  'nfse.read',
  'occurrences.resolve',
]
const COMPANY_ADMIN = [...OPERATOR, 'settings.manage', 'billing.create', 'users.manage']

const WALLED = ['company-settings', 'extra-charges', 'nfse-invoice'] as const

function forbidden(permissions: readonly string[], workspace: (typeof WALLED)[number]): boolean {
  return isWorkspaceForbidden({ companyId: COMPANY_ID, permissions, workspace })
}

describe('as três paredes novas barram por permissão (spec 221 CA09)', () => {
  it('o separador não abre nenhuma das três', () => {
    for (const workspace of WALLED) expect(forbidden(SEPARATOR, workspace)).toBe(true)
  })

  it('o motorista não abre nenhuma das três', () => {
    for (const workspace of WALLED) expect(forbidden(DRIVER, workspace)).toBe(true)
  })

  it('sem empresa no contexto a tela é parede, qualquer que seja a permissão', () => {
    expect(
      isWorkspaceForbidden({
        companyId: undefined,
        permissions: COMPANY_ADMIN,
        workspace: 'company-settings',
      }),
    ).toBe(true)
  })

  /**
   * Repasses é a parede que fecha exposição de verdade: a tela não tinha checagem nenhuma e a
   * consulta da lista não tinha `enabled`. A regra é a permissão de dinheiro (D4) — `trip.manage`,
   * que o separador tem, não serve.
   */
  it('Repasses abre para quem cuida de dinheiro, e só', () => {
    expect(forbidden(FINANCE, 'extra-charges')).toBe(false)
    expect(forbidden(OPERATOR, 'extra-charges')).toBe(false)
    expect(forbidden(COMPANY_ADMIN, 'extra-charges')).toBe(false)
    expect(forbidden(['trip.manage'], 'extra-charges')).toBe(true)
  })

  /**
   * Empresa exige `settings.manage`, que o operador não tem — o `GET /company-settings` da API
   * também o exige, então esconder dele está certo. Esta asserção já nasceu errada uma vez, com um
   * fixture que inventava a permissão para o papel.
   */
  it('Empresa é do administrador, não do operador', () => {
    expect(forbidden(COMPANY_ADMIN, 'company-settings')).toBe(false)
    expect(forbidden(OPERATOR, 'company-settings')).toBe(true)
  })

  it('NFS-e abre pelas duas portas: quem lê nota e quem só configura', () => {
    expect(forbidden(OPERATOR, 'nfse-invoice')).toBe(false)
    expect(forbidden(['settings.manage'], 'nfse-invoice')).toBe(false)
    expect(forbidden(['fleet.read'], 'nfse-invoice')).toBe(true)
  })
})

describe('as três páginas delegam a decisão, em vez de recalcular', () => {
  const PAGES = [
    'src/modules/company-settings/pages/CompanySettings.page.tsx',
    'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx',
    'src/modules/extra-charges/pages/ExtraChargeWorkspace.page.tsx',
  ]

  for (const path of PAGES) {
    it(`${path.split('/')[2]} chama isWorkspaceForbidden`, () => {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

      expect(source).toInclude('isWorkspaceForbidden')
      expect(source).not.toInclude('canOpenWorkspace')
    })
  }

  it('a consulta de Repasses morre com a parede — esconder o render não bastaria', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/extra-charges/pages/ExtraChargeWorkspace.page.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toInclude('enabled: !isForbidden')
  })
})
