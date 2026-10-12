/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T5.1 (contract §2): no fio do escritório (`perspective="operator"`) o microfone aparece
 * só com a prop `audioRecording` — e com ela, no desktop, no lugar do enviar de um campo vazio, com
 * o nome em português do locale do painel. Sem a prop, nada muda.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConversationThread } from '@adatechnology/conversations-ui/participant'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import locale from '../../src/modules/occurrence-conversation/locales/subjectConversation.locale.json'
import { SUBJECT_AUDIO_RECORDING_OPTIONS } from '../../src/modules/occurrence-conversation/shared/subjectAudioRecording.service'
import { buildSubjectThreadLabels } from '../../src/modules/occurrence-conversation/shared/subjectThreadLabels.service'

const RECORD_LABEL = 'Gravar áudio'
const labels = buildSubjectThreadLabels(
  (key) =>
    (locale.thread.labels as Record<string, string>)[key.replace('thread.labels.', '')] ?? key,
  'Encerrada',
)

class FakeMediaRecorder {
  static isTypeSupported(): boolean {
    return true
  }
}

let root: Root | undefined
let container: HTMLDivElement | undefined

function renderThread(withRecording: boolean): HTMLElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      createElement(ConversationThread, {
        api: {
          fetchMessages: () => Promise.resolve([]),
          resolveAttachmentUrl: () => Promise.reject(new Error('unused')),
          sendMessage: () => Promise.reject(new Error('unused')),
        },
        ...(withRecording ? { audioRecording: SUBJECT_AUDIO_RECORDING_OPTIONS } : {}),
        labels,
        perspective: 'operator',
        subject: { subjectId: 'doc-1', subjectType: 'document' },
        title: 'NF 4521',
      }),
    )
  })
  return container
}

beforeEach(() => {
  Object.assign(globalThis, { MediaRecorder: FakeMediaRecorder })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: () => Promise.reject(new Error('unused')) },
  })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = undefined
  container = undefined
  Reflect.deleteProperty(globalThis, 'MediaRecorder')
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('o microfone no fio do escritório (spec 264 T5.1)', () => {
  it('com a prop e o campo vazio: o microfone ocupa o lugar do enviar, com o nome do locale', () => {
    const view = renderThread(true)
    const record = view.querySelector('.cv-p-composer__record')
    expect(record).not.toBeNull()
    expect(record?.getAttribute('aria-label') ?? record?.textContent).toContain(RECORD_LABEL)
  })

  it('sem a prop: nenhum microfone, mesmo com o navegador gravando', () => {
    const view = renderThread(false)
    expect(view.querySelector('.cv-p-composer__record')).toBeNull()
    expect(view.textContent).not.toContain(RECORD_LABEL)
  })
})
