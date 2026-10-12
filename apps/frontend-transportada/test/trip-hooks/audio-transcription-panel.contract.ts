/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T5.2 (RF15/RF17): a seção "Transcrever áudios das conversas" **montada de verdade** — vale o DOM
 * renderizado. O cliente HTTP é trocado uma vez; cada teste reconfigura `fakes`.
 */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import { renderWithQueryClient, settle, waitFor, type RenderedComponent } from './renderHook.helper'

import '../../src/modules/shared/i18n/i18n.service'
import { AudioTranscriptionSettingsPanel } from '../../src/modules/occurrence-conversation/components/AudioTranscriptionSettingsPanel.component'
import type { AudioTranscriptionSettings } from '../../src/modules/occurrence-conversation/shared/audioTranscription.service'
import {
  AUDIO_TRANSCRIPTION_FAILURE,
  AudioTranscriptionRequestError,
  type AudioTranscriptionClient,
} from '../../src/modules/occurrence-conversation/shared/audioTranscriptionClient.service'

const ENABLED: AudioTranscriptionSettings = {
  enabled: true,
  maxDurationMs: 600_000,
  updatedAt: undefined,
}

const fakes: {
  calls: string[]
  get: () => Promise<AudioTranscriptionSettings>
  save: (enabled: boolean) => Promise<AudioTranscriptionSettings>
} = {
  calls: [],
  get: () => Promise.resolve(ENABLED),
  save: () => Promise.resolve(ENABLED),
}

const client: AudioTranscriptionClient = {
  get: () => {
    fakes.calls.push('get')
    return fakes.get()
  },
  save: (enabled) => {
    fakes.calls.push(`save:${JSON.stringify({ enabled })}`)
    return fakes.save(enabled)
  },
}

void mock.module(
  '@/modules/occurrence-conversation/shared/audioTranscriptionClient.provider',
  () => ({
    getAudioTranscriptionClient: () => client,
  }),
)

let rendered: RenderedComponent | undefined
async function mountPanel(canManage = true): Promise<void> {
  rendered = await renderWithQueryClient(
    createElement(AudioTranscriptionSettingsPanel, { canManage }),
  )
  await settle()
}

function text(): string {
  return document.body.textContent ?? ''
}

function control(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (found === null) throw new Error('CONTROL_NOT_FOUND')
  return found
}

async function toggle(): Promise<void> {
  await act(async () => {
    control().click()
    await Promise.resolve()
  })
  await settle()
}

function never<TValue>(): Promise<TValue> {
  return new Promise(() => undefined)
}

describe('seção de transcrição das conversas (spec 264 T5.2)', () => {
  beforeEach(() => {
    fakes.calls = []
    fakes.get = () => Promise.resolve(ENABLED)
    fakes.save = () => Promise.resolve(ENABLED)
  })

  afterEach(async () => {
    rendered?.unmount()
    rendered = undefined
    await settle()
  })

  it('ligada: mostra o controle marcado, o limite em minutos e a explicação de máquina', async () => {
    await mountPanel()

    expect(control().checked).toBe(true)
    expect(text()).toContain('Transcrever áudios das conversas')
    expect(text()).toContain('Só áudios de menos de 10 minutos são transcritos.')
    expect(text()).toContain('gerada por máquina')
    expect(text()).toContain('nenhuma voz sai para serviço externo')
  })

  it('os minutos saem do teto devolvido pela API: 600000 dá 10 e 300000 dá 5', async () => {
    fakes.get = () => Promise.resolve({ ...ENABLED, maxDurationMs: 300_000 })
    await mountPanel()
    expect(text()).toContain('Só áudios de menos de 5 minutos são transcritos.')
    expect(text()).not.toContain('10 minutos')
  })

  it('desligada: controle desmarcado e a frase do que acontece ao desligar sempre à vista', async () => {
    fakes.get = () => Promise.resolve({ ...ENABLED, enabled: false })
    await mountPanel()

    expect(control().checked).toBe(false)
    expect(text()).toContain('ficam guardadas, mas escondidas')
    expect(text()).toContain('não são transcritos depois, mesmo que você ligue de novo')
  })

  it('o controle tem nome acessível e a descrição ligada por aria-describedby', async () => {
    await mountPanel()

    expect(control().closest('label')?.textContent).toContain(
      'Transcrever os áudios das conversas desta empresa',
    )
    const describedBy = control().getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    const description = document.getElementById(describedBy ?? '')
    expect(description?.textContent).toContain('Só áudios de menos de 10 minutos')
    expect(description?.textContent).toContain('ficam guardadas, mas escondidas')
    expect(document.querySelector('section')?.getAttribute('aria-labelledby')).not.toBeNull()
  })

  it('desligar grava só { enabled: false } e guarda a resposta com a data da alteração', async () => {
    const saved = { ...ENABLED, enabled: false, updatedAt: '2026-10-12T15:30:00.000Z' }
    fakes.save = () => Promise.resolve(saved)
    await mountPanel()
    expect(text()).not.toContain('Última alteração')
    fakes.get = () => Promise.resolve(saved)

    await toggle()

    expect(fakes.calls).toContain('save:{"enabled":false}')
    await waitFor(() => expect(control().checked).toBe(false))
    expect(text()).toContain('Última alteração:')
  })

  it('salvando: mostra o valor pedido já, avisa com role=status e ignora um segundo clique', async () => {
    fakes.save = () => never()
    await mountPanel()

    await toggle()
    await toggle()

    expect(control().checked).toBe(false)
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Salvando a configuração')
    expect(fakes.calls.filter((call) => call.startsWith('save:'))).toHaveLength(1)
  })

  it('erro ao gravar: volta ao valor anterior e mostra o erro com role=alert', async () => {
    fakes.save = () =>
      Promise.reject(new AudioTranscriptionRequestError(AUDIO_TRANSCRIPTION_FAILURE.FORBIDDEN))
    await mountPanel()
    fakes.get = () => never()

    await toggle()

    await waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull())
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Você não tem permissão para alterar esta configuração.',
    )
    expect(control().checked).toBe(true)
  })

  it('erro de leitura: avisa, não mostra o controle e oferece tentar de novo', async () => {
    fakes.get = () =>
      Promise.reject(
        new AudioTranscriptionRequestError(AUDIO_TRANSCRIPTION_FAILURE.UNAUTHENTICATED),
      )
    await mountPanel()

    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Sua sessão expirou. Entre de novo para continuar.',
    )
    expect(document.querySelector('input')).toBeNull()
    expect(text()).toContain('Tentar de novo')
  })

  it('sem settings.manage: a seção não aparece e nada é pedido à API', async () => {
    await mountPanel(false)

    expect(document.querySelector('section')).toBeNull()
    expect(text()).not.toContain('Transcrever áudios')
    expect(fakes.calls).toEqual([])
  })
})
