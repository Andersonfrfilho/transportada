/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 168 (RF01-RF06): medir o produto direto na linha do que falta medir, sem sair da viagem.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { resolvePendingMeasurementSubmission } from '@/modules/trip/shared/tripPendingMeasurementInline.service'
import en from '@/modules/trip/locales/trip.en.locale.json'
import trip from '@/modules/trip/locales/trip.locale.json'

const COMPONENT_PATH = new URL(
  '../../src/modules/trip/components/TripPendingMeasurements.component.tsx',
  import.meta.url,
)

describe('resolvePendingMeasurementSubmission (spec 168 RF02, RF05, CA01, CA03)', () => {
  it('incompleto não grava e não reclama', () => {
    expect(resolvePendingMeasurementSubmission({ length: '38' })).toEqual({ ready: false })
    expect(resolvePendingMeasurementSubmission({})).toEqual({ ready: false })
  })

  it('os três preenchidos e dentro da faixa: pronto para gravar, em milímetro', () => {
    const result = resolvePendingMeasurementSubmission({
      height: '10',
      length: '38,5',
      width: '20',
    })

    expect(result).toEqual({ heightMm: 100, lengthMm: 385, ready: true, widthMm: 200 })
  })

  it('um campo fora de faixa: não grava, mesmo com os três preenchidos', () => {
    const result = resolvePendingMeasurementSubmission({
      height: '10',
      length: '9999',
      width: '20',
    })

    expect(result).toEqual({ ready: false })
  })

  it('zero ou negativo não grava', () => {
    expect(resolvePendingMeasurementSubmission({ height: '0', length: '10', width: '10' })).toEqual(
      {
        ready: false,
      },
    )
    expect(
      resolvePendingMeasurementSubmission({ height: '-5', length: '10', width: '10' }),
    ).toEqual({
      ready: false,
    })
  })
})

describe('a tabela do que falta medir ganha os campos de medida (spec 168)', () => {
  it('só desenha os campos quando o operador pode medir (RF06, CA05)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain("permissions.includes('cargo.measure')")
  })

  it('reusa a gravação da fila de medição, nunca uma escrita própria (RF03)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('useMeasurePendingBox')
  })

  /**
   * Spec 168 (defeito medido): a API do detalhe da viagem nunca enriquece `packageBoxId` — a chave
   * chega `undefined`, não `null`. `=== null` deixava passar, todas as linhas compartilhavam o
   * rascunho `drafts["undefined"]` e a gravação ia com `id: undefined`, sem gravar nada.
   */
  it('produto sem caixa casada (null OU undefined) aparece sem campos, com o motivo (edge case)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('packageBoxId == null')
    expect(source).not.toContain('packageBoxId === null')
    expect(source).toContain('if (boxId == null) return')
    expect(source).toContain('if (boxId == null) return null')
  })

  it('duas linhas com caixas diferentes nunca dividem o mesmo rascunho (edge case)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    // O rascunho é sempre indexado pelo `boxId` real da linha, nunca por uma chave compartilhada.
    expect(source).toContain('drafts[boxId]')
    expect(source).toMatch(/setDrafts\(\(current\) => \(\{ \.\.\.current, \[boxId\]:/)
  })

  it('a gravação sempre envia o id da própria linha, nunca um id fixo (RF03)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toMatch(/measure\.mutate\(\s*\{[\s\S]{0,120}id: boxId,/)
  })

  it('falha de rede mantém o valor digitado (CA06)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    // O estado do rascunho nunca é limpo num `onError` — só quando a gravação dá certo.
    expect(source).not.toMatch(/onError[\s\S]{0,80}setDraft/)
  })

  /**
   * O usuário reclamou que preenchia os três campos e não via nada acontecer — "não temos botão
   * de salvar medidas". A gravação automática no blur saiu: agora é um clique explícito, e a
   * confirmação visível continua sendo o retorno de que gravou.
   */
  it('confirma visivelmente que a medida foi gravada (edge case)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('savedBoxIds')
    expect(source).toContain("t('pendingMeasurement.inline.saved')")
  })

  it('não grava mais sozinho ao sair do campo — o operador pediu um botão (defeito medido)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).not.toContain('onBlur')
    expect(source).not.toContain('handleDimensionBlur')
  })

  it('tem um botão de salvar por linha, que só aparece com os três valores prontos (RF novo)', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('handleSaveBox')
    expect(source).toContain("t('pendingMeasurement.inline.saveRow')")
  })

  it('tem seleção por linha e uma ação para gravar as selecionadas de uma vez', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('Checkbox')
    expect(source).toContain('selectedBoxIds')
    expect(source).toContain("t('pendingMeasurement.inline.saveSelected'")
  })

  it('a seleção ignora linha sem caixa e linha sem os três valores, e avisa quantas ficaram de fora', () => {
    const source = readFileSync(COMPONENT_PATH, 'utf8')

    expect(source).toContain('readySelection')
    expect(source).toContain("t('pendingMeasurement.inline.selectionExcluded'")
  })

  it('textos em pt-BR e traduzidos (RF08)', () => {
    expect(trip.pendingMeasurement.inline.length).toBeString()
    expect(trip.pendingMeasurement.inline.width).toBeString()
    expect(trip.pendingMeasurement.inline.height).toBeString()
    expect(trip.pendingMeasurement.inline.outOfRange).toBeString()
    expect(trip.pendingMeasurement.inline.saveFailed).toBeString()
    expect(trip.pendingMeasurement.inline.noBoxReason).toBeString()
    expect(en.pendingMeasurement.inline.length).toBeString()
    expect(en.pendingMeasurement.inline.width).toBeString()
    expect(en.pendingMeasurement.inline.height).toBeString()
    expect(en.pendingMeasurement.inline.outOfRange).toBeString()
    expect(en.pendingMeasurement.inline.saveFailed).toBeString()
    expect(en.pendingMeasurement.inline.noBoxReason).toBeString()
    expect(trip.pendingMeasurement.inline.saved).toBeString()
    expect(en.pendingMeasurement.inline.saved).toBeString()
  })
})
