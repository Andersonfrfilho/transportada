/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 181 RF2/RF3 (CA02/CA03). Achado da `proposta-ux.md`: `hasOpenOccurrenceMarker(document)` e
 * `document.openOccurrenceCase === true` são a **mesma condição booleana** — a linha da nota
 * renderizava as duas, uma como botão ("Ocorrência aberta") e outra como selo com tooltip
 * ("Ocorrência em tratativa"), dizendo o mesmo fato duas vezes. Os selos da nota passam a ser três
 * eixos, nunca quatro: pipeline (separationStatus, com o motivo da devolução junto), ocorrência
 * (um selo só, clicável) e fiscal (fiscalReadiness).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripLocale from '@/modules/trip/locales/trip.locale.json'

import { tripDocumentReturnReasonCode } from '@/modules/trip/shared/tripDocument.service'

const ROW = new URL('../../src/modules/trip/components/TripStopList.component.tsx', import.meta.url)

describe('os selos da nota são três eixos, não quatro (spec 181 RF2/CA02)', () => {
  const source = readFileSync(ROW, 'utf8')

  /**
   * ⚠️ **O núcleo do defeito.** Duas renderizações a partir da mesma condição booleana produziam
   * dois selos para o mesmo fato. A correção não pode manter os dois textos — só um.
   */
  it('a tratativa aberta produz um selo só, não dois', () => {
    expect(source).not.toContain('document.openOccurrenceCase === true')
    expect(source).not.toContain("t('stops.openOccurrenceDocument')")

    const ocorrenciaAberta = (source.match(/hasOpenOccurrenceMarker\(document\)/gu) ?? []).length
    expect(ocorrenciaAberta).toBe(1)

    const textoTratativa = (source.match(/t\('occurrence\.openCase'\)/gu) ?? []).length
    expect(textoTratativa).toBe(1)
  })

  /** Proposta item 4: o selo de ocorrência é clicável — não precisa de um botão irmão ao lado. */
  it('o selo de ocorrência é o próprio gatilho do diálogo, com a dica de que a nota segue liberada', () => {
    const inicio = source.indexOf('hasOpenOccurrenceMarker(document)')
    const trecho = source.slice(inicio, source.indexOf('null}', inicio))

    expect(trecho).toContain("t('occurrence.openCaseHint')")
    expect(trecho).toContain('actions.onOpenSeparationOccurrence(document.id)')
  })
})

describe('o selo de pipeline carrega o motivo da devolução (spec 181 RF3/CA03)', () => {
  const DEVOLVIDA = { returnReason: 'recipient_absent', separationStatus: 'returned' as const }

  it('devolvida com motivo leva o código adiante', () => {
    expect(tripDocumentReturnReasonCode(DEVOLVIDA)).toBe('recipient_absent')
  })

  /** Caso extremo do spec.md: devolução sem motivo não inventa sufixo. */
  it('devolvida sem motivo não tem o que anexar', () => {
    expect(tripDocumentReturnReasonCode({ ...DEVOLVIDA, returnReason: null })).toBeNull()
    expect(tripDocumentReturnReasonCode({ ...DEVOLVIDA, returnReason: '' })).toBeNull()
  })

  /** Motivo presente numa nota que não está devolvida não é o eixo de pipeline desta nota. */
  it('só a nota devolvida carrega o sufixo, mesmo com motivo preenchido', () => {
    expect(tripDocumentReturnReasonCode({ ...DEVOLVIDA, separationStatus: 'delivered' })).toBeNull()
  })

  it('a linha compõe o selo com o motivo traduzido, com queda para o código (migration legado)', () => {
    const source = readFileSync(ROW, 'utf8')

    expect(source).toContain('tripDocumentReturnReasonCode(document)')
    expect(source).toContain("t('stops.separationStatusWithReason'")
    expect(source).toContain('fieldActions.returnReason.${returnReasonCode}')
    expect(source).toContain('defaultValue: returnReasonCode')
  })

  it('o dicionário compõe status e motivo com o mesmo separador do resto da tela', () => {
    expect(tripLocale.stops.separationStatusWithReason).toBe('{{status}} · {{reason}}')
  })
})
