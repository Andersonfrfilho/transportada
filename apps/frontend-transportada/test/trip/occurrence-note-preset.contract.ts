/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  appendOccurrenceNotePreset,
  OCCURRENCE_NOTE_PRESET_IDS,
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
