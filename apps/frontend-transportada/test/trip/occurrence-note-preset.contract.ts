/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  appendOccurrenceNotePreset,
  OCCURRENCE_NOTE_LIMIT,
  OCCURRENCE_NOTE_PRESET_IDS,
  resolveOccurrenceNoteCounter,
} from '@/modules/trip/shared/occurrenceNotePreset.service'
import ptBr from '@/modules/trip/locales/trip.locale.json'

describe('appendOccurrenceNotePreset', () => {
  test('observação vazia recebe a frase inteira', () => {
    expect(appendOccurrenceNotePreset({ note: '   ', preset: 'Produto avariado' })).toBe(
      'Produto avariado',
    )
  })

  test('acrescenta em vez de substituir o que o operador já escreveu', () => {
    expect(
      appendOccurrenceNotePreset({ note: 'Caixa 3 da paleta', preset: 'Volume molhado' }),
    ).toBe('Caixa 3 da paleta; Volume molhado')
  })

  test('clicar duas vezes não repete a frase', () => {
    const once = appendOccurrenceNotePreset({ note: '', preset: 'Produto trocado' })

    expect(appendOccurrenceNotePreset({ note: once, preset: 'Produto trocado' })).toBe(once)
  })

  test('toda frase pronta tem texto no dicionário pt-BR', () => {
    const presets = ptBr.occurrence.notePresets as Readonly<Record<string, string>>

    for (const presetId of OCCURRENCE_NOTE_PRESET_IDS) {
      expect(presets[presetId]).toBeTruthy()
    }
  })
})

/** O teto é do servidor (`occurrence.schema.ts`: `z.string().trim().max(500)`). */
describe('resolveOccurrenceNoteCounter', () => {
  test('conta o texto aparado, como o Zod da rota', () => {
    const counter = resolveOccurrenceNoteCounter('  doze caracteres  ')

    expect(counter.used).toBe('doze caracteres'.length)
    expect(counter.limit).toBe(OCCURRENCE_NOTE_LIMIT)
    expect(counter.isNearLimit).toBe(false)
    expect(counter.isOverLimit).toBe(false)
  })

  test('avisa antes do fim, não no envio', () => {
    expect(resolveOccurrenceNoteCounter('a'.repeat(460)).isNearLimit).toBe(true)
    expect(resolveOccurrenceNoteCounter('a'.repeat(449)).isNearLimit).toBe(false)
  })

  test('acima do teto é estado próprio, nunca "quase lá"', () => {
    const counter = resolveOccurrenceNoteCounter('a'.repeat(OCCURRENCE_NOTE_LIMIT + 1))

    expect(counter.isOverLimit).toBe(true)
    expect(counter.isNearLimit).toBe(false)
    expect(counter.remaining).toBe(-1)
  })
})
