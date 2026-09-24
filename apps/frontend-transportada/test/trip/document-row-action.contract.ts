/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 175 RF1/RF2/RF7: o botão da linha deixa de ser fixo em "Gerar CT-e" e passa a sair de
 * `expectedDocument`. Campo ausente na resposta trata como `null` (city_unknown) — ausência nunca
 * vira "é CT-e".
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveDocumentRowAction } from '@/modules/trip/shared/documentRowAction.service'
import { readinessReasonIcon } from '@/modules/trip/shared/readinessIcon.service'
import type { TripDocumentReadiness } from '@/modules/trip/shared/trip.types'

const SERVICO = new URL(
  '../../src/modules/trip/shared/documentRowAction.service.ts',
  import.meta.url,
)
const LISTA = new URL(
  '../../src/modules/trip/components/TripStopList.component.tsx',
  import.meta.url,
)

const BASE: TripDocumentReadiness = {
  cteAccessKey: null,
  cteFiscalDocumentId: null,
  expectedDocument: 'cte',
  nfeDocumentId: '00000000-0000-4000-8000-000000000003',
  nfseProfileId: null,
  reason: 'no_cte',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

describe('a ação da linha sai do dado (spec 175 RF1, RF2, RF7)', () => {
  it('expectedDocument cte pendente, com cte.submit, oferece emitir CT-e', () => {
    expect(resolveDocumentRowAction(BASE, { canIssueNfse: false, canSubmitCte: true })).toEqual({
      kind: 'cte',
    })
  })

  it('expectedDocument nfse pendente, com nfse.issue, oferece emitir NFS-e', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'nfse_expected' },
        { canIssueNfse: true, canSubmitCte: false },
      ),
    ).toEqual({ kind: 'nfse' })
  })

  it('expectedDocument null (city_unknown) não oferece ação nenhuma', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: null, reason: 'city_unknown' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('campo ausente na resposta (entry undefined) trata como null — sem ação', () => {
    expect(
      resolveDocumentRowAction(undefined, { canIssueNfse: true, canSubmitCte: true }),
    ).toBeNull()
  })

  it('nota cte já pronta não oferece ação', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, reason: 'ok' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('nota nfse já emitida (reason ok) não oferece ação', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'ok' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('permissão por documento: sem cte.submit não oferece CT-e mesmo pendente', () => {
    expect(resolveDocumentRowAction(BASE, { canIssueNfse: true, canSubmitCte: false })).toBeNull()
  })

  /**
   * Bloqueada e sem perfil vêm da fonte única do documento de saída, não da resolução de perfil de
   * CT-e. Oferecer ação nelas terminaria em erro do outro lado; a linha informa e cala.
   */
  it('nota bloqueada não oferece ação, mesmo com as duas permissões', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'blocked', reason: 'blocked' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  it('nota sem perfil de emissão não oferece ação, mesmo com as duas permissões', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'no_profile', reason: 'no_profile' },
        { canIssueNfse: true, canSubmitCte: true },
      ),
    ).toBeNull()
  })

  /**
   * Os dois casos acima passariam por acidente: hoje eles caem no ramo da NFS-e e só devolvem `null`
   * porque o motivo não é `nfse_expected`. A recusa tem de ser **decisão escrita**, senão a primeira
   * mudança naquele ramo passa a oferecer emissão para uma nota bloqueada.
   */
  it('a recusa dos dois estados está escrita, não é resto do ramo da NFS-e', () => {
    const source = readFileSync(SERVICO, 'utf8')

    expect(source).toInclude("'blocked'")
    expect(source).toInclude("'no_profile'")
  })

  it('permissão por documento: sem nfse.issue não oferece NFS-e mesmo pendente', () => {
    expect(
      resolveDocumentRowAction(
        { ...BASE, expectedDocument: 'nfse', reason: 'nfse_expected' },
        { canIssueNfse: false, canSubmitCte: true },
      ),
    ).toBeNull()
  })
})

describe('a linha informa o estado que não tem ação (spec 175 RF5, CA04)', () => {
  /** O selo fiscal já existe e é por motivo — os dois estados novos entram nele, sem componente novo. */
  it('os dois estados têm ícone e texto, nas duas locales', () => {
    for (const locale of ['trip.locale.json', 'trip.en.locale.json']) {
      const source = readFileSync(
        new URL(`../../src/modules/trip/locales/${locale}`, import.meta.url),
        'utf8',
      )
      const reasons = (JSON.parse(source) as { readiness: { reason: Record<string, string> } })
        .readiness.reason

      for (const reason of ['blocked', 'no_profile'] as const) {
        expect(readinessReasonIcon(reason)).toBeString()
        expect(reasons[reason]).toBeString()
      }
    }
  })

  /** Estado sem ação tem de aparecer: o selo só some quando a nota está `ok`. */
  it('o selo da linha aparece para todo motivo que não seja ok', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude("fiscalReadiness.reason !== 'ok'")
  })
})

describe('a linha usa o rótulo derivado do documento esperado (spec 175 CA01)', () => {
  it('não fixa mais o rótulo de CT-e sem checar o documento esperado', () => {
    const source = readFileSync(LISTA, 'utf8')

    expect(source).toInclude('resolveDocumentRowAction(')
    /* O rótulo de NFS-e é do módulo dono: a linha renderiza a ação dele, e ela traz o próprio texto. */
    expect(source).toInclude('<NfseEmissionAction')
  })
})
