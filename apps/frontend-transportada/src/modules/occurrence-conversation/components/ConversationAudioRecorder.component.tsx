/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T705 (RF17, P9): gravar um áudio na caixa de envio, ouvir antes e usar ou descartar. O
 * áudio usado entra como anexo do rascunho — sobe e é conferido pelos bytes como qualquer outro. A
 * gravação para sozinha no teto do pacote (5 min). O microfone só abre neste clique, e o
 * `Permissions-Policy` do painel o libera só para a própria origem.
 *
 * Navegador sem `MediaRecorder` não mostra o botão: o anexo de arquivo continua valendo.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import {
  CONVERSATION_RECORDING_MAX_MS,
  buildRecordedAudioFile,
  formatAudioDuration,
  pickRecordingFormat,
} from '../shared/conversationAudio.service'
import styles from '../styles/occurrenceConversation.module.css'

type Recorded = Readonly<{ file: File; url: string }>

function supportedFormat() {
  if (typeof MediaRecorder === 'undefined' || typeof navigator === 'undefined') return undefined
  if (navigator.mediaDevices?.getUserMedia === undefined) return undefined
  return pickRecordingFormat((type) => MediaRecorder.isTypeSupported(type))
}

export function ConversationAudioRecorder({
  disabled,
  onRecorded,
}: Readonly<{ disabled: boolean; onRecorded: (file: File) => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const [format] = useState(supportedFormat)
  const [state, setState] = useState<'failed' | 'idle' | 'recording'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [recorded, setRecorded] = useState<Recorded | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)

  /** Parar libera o microfone: a luz do navegador apaga assim que a gravação termina. */
  useEffect(
    () => () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    },
    [],
  )
  useEffect(
    () => () => {
      if (recorded !== null) URL.revokeObjectURL(recorded.url)
    },
    [recorded],
  )

  if (format === undefined) return null

  async function start(): Promise<void> {
    if (format === undefined) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState('failed')
      return
    }
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, { mimeType: format.mimeType })
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const spent = Date.now() - startedAt
      setElapsed(spent)
      if (spent >= CONVERSATION_RECORDING_MAX_MS && recorder.state === 'recording') recorder.stop()
    }, 250)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      window.clearInterval(timer)
      stream.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      const file = buildRecordedAudioFile({ chunks, format, now: new Date() })
      setRecorded({ file, url: URL.createObjectURL(file) })
      setState('idle')
    }
    recorderRef.current = recorder
    setElapsed(0)
    setRecorded(null)
    recorder.start(1000)
    setState('recording')
  }

  if (recorded !== null) {
    return (
      <div className={styles.audioRecorder} role="group" aria-label={t('audio.review')}>
        <audio aria-label={t('audio.review')} controls src={recorded.url} />
        <Button
          disabled={disabled}
          onClick={() => {
            onRecorded(recorded.file)
            setRecorded(null)
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="check" />
          {t('audio.use')}
        </Button>
        <Button onClick={() => setRecorded(null)} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('audio.discard')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.audioRecorder}>
      {state === 'recording' ? (
        <>
          <span className={styles.recordingClock} role="timer">
            {t('audio.recording', {
              elapsed: formatAudioDuration(elapsed),
              max: formatAudioDuration(CONVERSATION_RECORDING_MAX_MS),
            })}
          </span>
          <Button
            onClick={() => recorderRef.current?.stop()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="stop" />
            {t('audio.stop')}
          </Button>
        </>
      ) : (
        <Button
          disabled={disabled}
          onClick={() => void start()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="microphone" />
          {t('audio.record')}
        </Button>
      )}
      {state === 'failed' ? (
        <p className={styles.error} role="alert">
          {t('audio.microphoneError')}
        </p>
      ) : null}
    </div>
  )
}
