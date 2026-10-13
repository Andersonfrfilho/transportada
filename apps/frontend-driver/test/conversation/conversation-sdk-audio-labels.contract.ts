/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'bun:test'

type LabelCatalog = Readonly<{ labels: Readonly<Record<string, unknown>> }>

const LOCALES = {
  en: new URL(
    '../../src/modules/conversation/locales/conversation.en.locale.json',
    import.meta.url,
  ),
  'pt-BR': new URL(
    '../../src/modules/conversation/locales/conversation.locale.json',
    import.meta.url,
  ),
} as const

/** Rótulos do player e da transcrição (contract.md §4) que aparecem para todo host assim que o SDK sobe. */
const PLAYER_AND_TRANSCRIPTION_LABELS = {
  audioPlayer: [],
  audioPosition: [],
  audioPositionValue: ['{position}', '{duration}'],
  audioUnavailable: [],
  collapseTranscription: [],
  emptyTranscription: [],
  machineTranscription: [],
  pauseAudio: [],
  playAudio: [],
  playbackRate: ['{rate}'],
  showFullTranscription: [],
  transcribing: [],
  transcriptionReady: [],
  transcriptionTooLong: ['{minutes}'],
} as const satisfies Readonly<Record<string, readonly string[]>>

/** Rótulos do gravador (contract.md §4), ligados na T4.3 junto com a prop `audioRecording`. */
const RECORDER_LABELS = {
  audioEmpty: [],
  audioTooLarge: [],
  discardAudio: [],
  microphoneDenied: [],
  recordAudio: [],
  recordingElapsed: ['{elapsed}', '{limit}'],
  recordingInProgress: [],
  recordingUnsupported: [],
  reviewAudio: [],
  sendAudio: [],
  stopRecording: [],
} as const satisfies Readonly<Record<string, readonly string[]>>

async function readLabels(locale: keyof typeof LOCALES): Promise<LabelCatalog['labels']> {
  const catalog = JSON.parse(await readFile(LOCALES[locale], 'utf8')) as LabelCatalog
  return catalog.labels
}

describe('conversations-ui 0.10.0 / conversation-contracts 0.6.0 no app do motorista (spec 264 T4.1)', () => {
  it('as duas dependências sobem juntas, em versão exata', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Readonly<Record<string, string>> }

    expect(manifest.dependencies['@adatechnology/conversations-ui']).toBe('0.10.0')
    expect(manifest.dependencies['@adatechnology/conversation-contracts']).toBe('0.6.0')
  })

  for (const locale of Object.keys(LOCALES) as (keyof typeof LOCALES)[]) {
    it(`${locale}: traz todo rótulo do player, da transcrição e do gravador, com os mesmos marcadores do SDK`, async () => {
      const labels = await readLabels(locale)

      for (const [key, placeholders] of Object.entries({
        ...PLAYER_AND_TRANSCRIPTION_LABELS,
        ...RECORDER_LABELS,
      })) {
        const value = labels[key]
        expect(typeof value === 'string' && value.trim() !== '').toBe(true)
        for (const placeholder of placeholders) expect(value as string).toContain(placeholder)
      }
    })
  }
})
