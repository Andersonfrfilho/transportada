/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import routing from '@/modules/routing/locales/routing.locale.json'
import routingEn from '@/modules/routing/locales/routing.en.locale.json'

const REPORT = new URL(
  '../../src/modules/routing/components/SuggestionValuationReport.component.tsx',
  import.meta.url,
)
const DIALOG = new URL(
  '../../src/modules/routing/components/MultiVehicleSuggestionDialog.component.tsx',
  import.meta.url,
)

/**
 * Spec 101 D4. Contrato **de tela**, e ele existe porque o defeito que previne não aparece em teste
 * de domínio: a política sabe que o conjunto tem lacuna, e a interface pode imprimir o lucro sem
 * dizer. Quem decide aceitar a distribuição lê um número e trata como previsão fechada.
 */
describe('relatório do conjunto (spec 101 T7)', () => {
  const source = readFileSync(REPORT, 'utf8')

  it('imprime tempo, distância, gasto e lucro', () => {
    expect(source).toInclude("t('report.duration')")
    expect(source).toInclude("t('report.distance')")
    expect(source).toInclude("t('report.cost')")
    expect(source).toInclude("t('report.margin')")
  })

  it('diz quantas entregas cada veículo levou', () => {
    expect(source).toInclude("t('report.deliveries'")
  })

  it('imprime a marca de incompleto quando o conjunto tem lacuna', () => {
    expect(source).toInclude('report.hasGaps')
    expect(source).toInclude("t('report.incomplete')")
  })

  /**
   * ⚠️ A marca não pode ser condicional a mais nada além de `hasGaps`: um `&&` a mais — permissão,
   * aba aberta, tamanho de tela — é o caminho pelo qual ela desaparece sem ninguém notar.
   */
  it('não esconde a marca atrás de segunda condição', () => {
    const start = source.indexOf('report.hasGaps')
    const trecho = source.slice(start, source.indexOf("t('report.incomplete')", start))

    expect(trecho).not.toInclude('&&')
  })

  /** As lacunas por extenso: um total incompleto sem dizer o que falta não é acionável. */
  it('lista as lacunas do conjunto por extenso', () => {
    expect(source).toInclude('report.gaps')
  })

  it('está montado no diálogo da distribuição', () => {
    expect(readFileSync(DIALOG, 'utf8')).toInclude('SuggestionValuationReport')
  })

  it('tem rótulo nos dois idiomas', () => {
    for (const dictionary of [routing, routingEn]) {
      const report = (dictionary as Record<string, Record<string, unknown>>).report
      for (const key of [
        'cost',
        /**
         * ⚠️ i18next 25 resolve plural por `_one`/`_other`. A chave sem sufixo **não é consumida**:
         * `t('report.deliveries', {count})` cairia no próprio nome da chave na tela.
         */
        'deliveries_one',
        'deliveries_other',
        'distance',
        'duration',
        'incomplete',
        'margin',
        'revenue',
        'title',
        'unknown',
      ]) {
        expect(report?.[key], `falta report.${key}`).toBeTruthy()
      }
    }
  })
})
