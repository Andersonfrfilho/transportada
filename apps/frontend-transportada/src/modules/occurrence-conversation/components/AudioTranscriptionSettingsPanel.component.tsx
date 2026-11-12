/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useAudioTranscriptionQuery,
  useSaveAudioTranscriptionMutation,
} from '../queries/audioTranscription.query'
import { minutesOfAudioTranscriptionLimit } from '../shared/audioTranscription.service'
import {
  AUDIO_TRANSCRIPTION_FAILURE,
  AudioTranscriptionRequestError,
  type AudioTranscriptionFailure,
} from '../shared/audioTranscriptionClient.service'
import styles from '../styles/occurrenceConversation.module.css'

type AudioTranscriptionSettingsPanelProps = Readonly<{
  /** `settings.manage`: sem ela a seção não aparece e a consulta não sobe (a API recusaria). */
  canManage: boolean
}>

function failureOf(error: unknown): AudioTranscriptionFailure {
  return error instanceof AudioTranscriptionRequestError
    ? error.failure
    : AUDIO_TRANSCRIPTION_FAILURE.FAILED
}

function formatMoment(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/**
 * Spec 264 RF15/RF17: liga e desliga a transcrição dos áudios da empresa. O texto do limite sai do teto que a API
 * devolve; a frase do que acontece ao desligar (D9) fica sempre à vista, ligada ao controle por `aria-describedby`.
 */
export function AudioTranscriptionSettingsPanel({
  canManage,
}: AudioTranscriptionSettingsPanelProps) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const descriptionId = useId()
  const query = useAudioTranscriptionQuery({ enabled: canManage })
  const mutation = useSaveAudioTranscriptionMutation()
  const settings = query.data

  function handleToggle(enabled: boolean): void {
    if (mutation.isPending) return
    mutation.mutate(enabled)
  }

  if (!canManage) return null

  return (
    <section aria-labelledby={titleId} className={`${styles.panel} ${styles.settingsPanel}`}>
      <h2 id={titleId}>{t('audioTranscription.title')}</h2>
      {query.isPending ? (
        <SkeletonGroup label={t('audioTranscription.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.panel}>
          <p className={styles.error} role="alert">
            {t(`audioTranscription.error.${failureOf(query.error)}`)}
          </p>
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('audioTranscription.retry')}
          </Button>
        </div>
      ) : null}
      {settings === undefined ? null : (
        <>
          <div id={descriptionId}>
            <p className={styles.hint}>{t('audioTranscription.machine')}</p>
            <p className={styles.hint}>
              {t('audioTranscription.limit', {
                count: minutesOfAudioTranscriptionLimit(settings.maxDurationMs),
                minutes: minutesOfAudioTranscriptionLimit(settings.maxDurationMs),
              })}
            </p>
            <p className={styles.hint}>{t('audioTranscription.effectOfTurningOff')}</p>
          </div>
          <Checkbox
            ariaDescribedBy={descriptionId}
            checked={settings.enabled}
            label={t('audioTranscription.toggle')}
            onChange={handleToggle}
          />
          {settings.updatedAt === undefined ? null : (
            <p className={styles.hint}>
              {t('audioTranscription.lastChange', {
                when: formatMoment(settings.updatedAt, i18n.resolvedLanguage ?? 'pt-BR'),
              })}
            </p>
          )}
        </>
      )}
      {mutation.isPending ? (
        <p className={styles.hint} role="status">
          {t('audioTranscription.saving')}
        </p>
      ) : null}
      {mutation.isError ? (
        <p className={styles.error} role="alert">
          {t(`audioTranscription.error.${failureOf(mutation.error)}`)}
        </p>
      ) : null}
    </section>
  )
}
