/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T705 (RF17, P9): o áudio no balão. O `<audio>` nativo dá tocar, posição e duração; a
 * velocidade (1×, 1,5×, 2×) é botão do design system, porque o `AudioPlayer` do pacote ainda não a
 * tem e é Tailwind.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { nextPlaybackRate } from '../shared/conversationAudio.service'
import styles from '../styles/occurrenceConversation.module.css'

const RATE_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export function ConversationAudioPlayer({ label, src }: Readonly<{ label: string; src: string }>) {
  const { t } = useTranslation('occurrenceConversation')
  const audioRef = useRef<HTMLAudioElement>(null)
  const [rate, setRate] = useState(1)

  /** `defaultPlaybackRate` sobrevive a um novo carregamento do `src`; `playbackRate` sozinho, não. */
  useEffect(() => {
    if (audioRef.current === null) return
    audioRef.current.defaultPlaybackRate = rate
    audioRef.current.playbackRate = rate
  }, [rate])

  const rateText = `${RATE_FORMATTER.format(rate)}×`
  return (
    <div className={styles.audioPlayer}>
      <audio
        aria-label={label}
        className={styles.messageAudio}
        controls
        preload="metadata"
        ref={audioRef}
        src={src}
      />
      <Button
        aria-label={t('audio.speed', { rate: rateText })}
        onClick={() => setRate(nextPlaybackRate)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {rateText}
      </Button>
    </div>
  )
}
