/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Frases prontas da observação da ocorrência. Quem separa registra em pé, no celular do galpão, e
 * digitar a mesma frase vinte vezes por dia é onde a observação vira "avariado" sem mais nada — o
 * botão escreve a frase inteira, e o texto continua editável depois.
 *
 * São identificadores estáveis: o texto vem do dicionário (`occurrence.notePresets.<id>`), nunca
 * literal na tela.
 */
export const OCCURRENCE_NOTE_PRESET_IDS = [
  'damagedProduct',
  'violatedPackaging',
  'missingQuantity',
  'divergentQuantity',
  'wrongProduct',
  'expiredProduct',
  'wetVolume',
] as const

export type OccurrenceNotePresetId = (typeof OCCURRENCE_NOTE_PRESET_IDS)[number]

const PRESET_SEPARATOR = '; '

/**
 * Acrescenta a frase ao que já foi escrito, em vez de substituir: duas ocorrências na mesma nota
 * ("caixa molhada" e "falta produto") são o caso comum, e sobrescrever apagaria o que o operador
 * acabou de digitar. Frase já presente não entra de novo — clicar duas vezes é engano, não ênfase.
 */
export function appendOccurrenceNotePreset(input: {
  readonly note: string
  readonly preset: string
}): string {
  const note = input.note.trim()
  const preset = input.preset.trim()
  if (preset === '') return input.note
  if (note === '') return preset
  if (note.toLowerCase().includes(preset.toLowerCase())) return note

  return `${note}${PRESET_SEPARATOR}${preset}`
}
