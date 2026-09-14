/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 (AC3, conversation-flow §5) — a volumetria numa mensagem, os bloqueios agrupados por
 * motivo na seguinte, e nunca o código cru na frente do operador.
 */
import { describe, expect, test } from 'bun:test'

import type { DocumentOutputClassification } from '../../src/cte-profiles/domain/document-output.policy.js'
import {
  formatVolumetryDetails,
  formatVolumetryHeadline,
  summarizeIssuanceVolumetry,
} from '../../src/whatsapp-commands/domain/issuance-volumetry.policy.js'
import { ISSUANCE_BLOCKED_NUMBERS_PER_REASON } from '../../src/whatsapp-commands/domain/whatsapp-issuance-flow.constant.js'

const CTE: DocumentOutputClassification = { output: 'cte' }
const NFSE: DocumentOutputClassification = { nfseProfileId: 'p', output: 'nfse' }
const NO_WEIGHT: DocumentOutputClassification = {
  output: 'blocked',
  reason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
}

function buildAc3Entries() {
  const entries: { classification: DocumentOutputClassification; number: string }[] = []
  for (let number = 1200; number <= 1250; number += 1) {
    const classification =
      number === 1201 || number === 1233 ? NO_WEIGHT : number >= 1240 ? NFSE : CTE
    entries.push({ classification, number: String(number) })
  }
  return entries
}

describe('volumetria da prévia (AC3)', () => {
  test('51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas', () => {
    const volumetry = summarizeIssuanceVolumetry(buildAc3Entries())
    expect(formatVolumetryHeadline(volumetry)).toBe('51 notas · 38 CT-e · 11 NFS-e · 2 bloqueadas')
  })

  test('a segunda mensagem traz só os bloqueados, agrupados por motivo em pt-BR', () => {
    const details = formatVolumetryDetails(summarizeIssuanceVolumetry(buildAc3Entries()))
    expect(details).toBe('Bloqueadas:\n• Sem peso da carga: 1201, 1233')
    expect(details).not.toContain('CTE_BATCH')
  })

  test('sem bloqueio nem nota sem perfil, não há segunda mensagem', () => {
    const volumetry = summarizeIssuanceVolumetry([{ classification: CTE, number: '1' }])
    expect(formatVolumetryHeadline(volumetry)).toBe('1 nota · 1 CT-e · 0 NFS-e')
    expect(formatVolumetryDetails(volumetry)).toBeUndefined()
  })

  test('acima do teto por motivo, lista os primeiros em ordem numérica e diz "e mais K"', () => {
    const entries = Array.from({ length: ISSUANCE_BLOCKED_NUMBERS_PER_REASON + 3 }, (_, index) => ({
      classification: NO_WEIGHT,
      number: String(100 - index),
    }))
    const details = formatVolumetryDetails(summarizeIssuanceVolumetry(entries)) ?? ''
    expect(details).toContain('88, 89, 90')
    expect(details).toContain('e mais 3')
    expect(details).not.toContain('100')
  })

  test('nota sem perfil conta à parte e diz o motivo sem código — inclusive o do perfil manual', () => {
    const volumetry = summarizeIssuanceVolumetry([
      { classification: CTE, number: '1' },
      { classification: { output: 'no_profile', reason: 'unmatched' }, number: '2' },
      { classification: { output: 'no_profile', reason: 'ambiguous' }, number: '3' },
      { classification: { output: 'no_profile', reason: 'not_cnpj' }, number: '4' },
    ])
    expect(formatVolumetryHeadline(volumetry)).toBe('4 notas · 1 CT-e · 0 NFS-e · 3 sem perfil')
    const details = formatVolumetryDetails(volumetry) ?? ''
    expect(details).toContain('Sem perfil de emissão:')
    expect(details).toMatch(/manual/)
    expect(details).not.toMatch(/unmatched|ambiguous|not_cnpj/)
  })

  test('motivo desconhecido nunca vaza o código cru', () => {
    const details =
      formatVolumetryDetails(
        summarizeIssuanceVolumetry([
          { classification: { output: 'blocked', reason: 'ALGUM_CODIGO_NOVO' }, number: '9' },
        ]),
      ) ?? ''
    expect(details).not.toContain('ALGUM_CODIGO_NOVO')
    expect(details).toContain('9')
  })

  test('os dois bloqueios que só a prévia vê têm rótulo próprio', () => {
    const details =
      formatVolumetryDetails(
        summarizeIssuanceVolumetry([
          {
            classification: { output: 'blocked', reason: 'NFSE_DOCUMENT_MISSING_TAKER_ADDRESS' },
            number: '1',
          },
          { classification: { output: 'blocked', reason: 'NFSE_CREDENTIAL_MISSING' }, number: '2' },
        ]),
      ) ?? ''
    expect(details).toContain('Sem o endereço completo do tomador: 1')
    expect(details).toContain('Nota RP')
  })
})
