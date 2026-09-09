/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import trip from '@/modules/trip/locales/trip.locale.json'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'

const PANEL = new URL(
  '../../src/modules/trip/components/TripRouteAssemblyLeftovers.component.tsx',
  import.meta.url,
)
const PAGE = new URL('../../src/modules/trip/pages/TripWorkspace.page.tsx', import.meta.url)

/**
 * Contrato **de tela**, e ele existe porque o defeito que previne não aparece em teste de domínio: a
 * API devolvia a sobra desde a spec 106 e a tela simplesmente não a lia. As notas sumiam da proposta
 * sem explicação nenhuma, e o roteiro **parecia completo**.
 */
describe('a sobra aparece na tela (spec 107)', () => {
  const source = readFileSync(PANEL, 'utf8')

  test('imprime o resumo e o expandido', () => {
    expect(source).toInclude("t('routeAssembly.leftovers.summary'")
    /** O rótulo do botão é ternário (mostrar/ocultar), então a chave aparece sem o `t(` colado. */
    expect(source).toInclude('routeAssembly.leftovers.show')
    expect(source).toInclude('routeAssembly.leftovers.hide')
  })

  /** As três causas pedem ações diferentes: cadastrar zona, corrigir endereço, ou nada. */
  test('separa as três causas', () => {
    expect(source).toInclude('routeAssembly.leftovers.notCovered')
    expect(source).toInclude('routeAssembly.leftovers.imprecise')
    expect(source).toInclude('routeAssembly.leftovers.alreadyLinked')
  })

  /**
   * ⚠️ O painel some **só** quando não há nada a dizer. Uma segunda condição — permissão, aba,
   * tamanho de tela — é o caminho pelo qual a sobra desaparece sem ninguém notar, e o roteiro volta
   * a parecer completo.
   */
  test('só some quando não há sobra nenhuma', () => {
    const guard = source.slice(source.indexOf('const total ='), source.indexOf('return ('))

    expect(guard).toInclude('if (total === 0) return null')
    expect(guard).not.toInclude('&&')
  })

  /**
   * ⚠️ Spec 107 D3: o botão só aparece com nota que **vale** tentar de novo. A parada de endereço
   * impreciso não fica melhor numa segunda montagem, e oferecê-lo ali convidaria o operador a
   * repetir o mesmo pedido esperando resultado diferente.
   */
  test('oferece continuar só quando há nota reaproveitável', () => {
    expect(source).toInclude('collectRetryableDocumentIds')
    expect(source).toInclude('retryable.length === 0 ? null')
    expect(source).toInclude("t('routeAssembly.leftovers.retry'")
  })

  /**
   * ⚠️ Spec 107 D3: a hora é **estimativa do planejamento**, e a frase tem de dizer isso ao lado —
   * hora sem a marca é promessa, e o operador espera um caminhão que pode não chegar (ADR-0044 §1).
   */
  test('a segunda onda diz a hora e que ela é estimativa', () => {
    expect(source).toInclude('resolveFreeingVehicles')
    expect(source).toInclude('routeAssembly.leftovers.secondWave')
    expect(source).toInclude('routeAssembly.leftovers.secondWaveUnknownPlate')

    for (const dictionary of [trip, tripEn]) {
      const leftovers = (dictionary as unknown as Record<string, Record<string, unknown>>)
        .routeAssembly?.leftovers as Record<string, string> | undefined

      expect(leftovers?.secondWave ?? '').toInclude('{{time}}')
      expect(leftovers?.secondWave ?? '').toInclude('{{plate}}')
      /** A marca de estimativa é do texto, e sem ela a frase vira promessa. */
      expect((leftovers?.secondWave ?? '').toLowerCase()).toMatch(/estimativa|estimate/)
      expect((leftovers?.secondWaveUnknownPlate ?? '').toLowerCase()).toMatch(/estimativa|estimate/)
    }
  })

  test('está montado na tela de viagens', () => {
    expect(readFileSync(PAGE, 'utf8')).toInclude('TripRouteAssemblyLeftovers')
  })

  test('tem rótulo nos dois idiomas', () => {
    for (const dictionary of [trip, tripEn]) {
      /** Desce pelo JSON sem prometer forma que o arquivo pode não ter — molde do gap-labels. */
      const routeAssembly = (dictionary as unknown as Record<string, unknown>).routeAssembly
      const leftovers =
        typeof routeAssembly === 'object' && routeAssembly !== null
          ? ((routeAssembly as Record<string, unknown>).leftovers as
              | Record<string, unknown>
              | undefined)
          : undefined

      for (const key of [
        'alreadyLinked_one',
        'alreadyLinked_other',
        'hide',
        'imprecise_one',
        'imprecise_other',
        'notCovered_one',
        'notCovered_other',
        'freeing_one',
        'freeing_other',
        'retry_one',
        'retry_other',
        'show',
        'secondWave',
        'secondWaveUnknownPlate',
        'summary_one',
        'summary_other',
        'title',
        'unknownPlate',
      ]) {
        expect(leftovers?.[key], `falta leftovers.${key}`).toBeTruthy()
      }
    }
  })
})
