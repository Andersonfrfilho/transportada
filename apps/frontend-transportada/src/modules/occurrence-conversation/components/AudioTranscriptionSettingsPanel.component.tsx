/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useAudioTranscriptionSettingsQuery,
  useSaveAudioTranscriptionSettingsMutation,
} from '../queries/audioTranscriptionSettings.query'
import { resolveAudioTranscriptionLimit } from '../shared/audioTranscriptionSettings.service'
import styles from '../styles/occurrenceConversation.module.css'

/**
 * Spec 264 RF17: liga e desliga a transcrição dos áudios das conversas (`settings.manage`). Desligar esconde,
 * não apaga, e não transcreve depois o que chegou enquanto esteve desligado (D9); só áudio abaixo do teto é
 * transcrito (RF15). A caixa mostra o valor pedido enquanto grava e volta ao gravado se o servidor recusar.
 */
export function AudioTranscriptionSettingsPanel({ enabled }: Readonly<{ enabled: boolean }>) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useAudioTranscriptionSettingsQuery({ enabled })
  const mutation = useSaveAudioTranscriptionSettingsMutation()

  if (query.isPending && enabled) {
    return (
      <SkeletonGroup label={t('audioTranscription.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="4rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (query.data === undefined) {
    return (
      <p className={styles.error} role="alert">
        {t('audioTranscription.loadError')}
      </p>
    )
  }

  const isChecked = mutation.isPending ? mutation.variables : query.data.enabled
  const limit = resolveAudioTranscriptionLimit(query.data.maxDurationMs)

  function handleChange(checked: boolean): void {
    if (mutation.isPending) return
    mutation.mutate(checked)
  }

  return (
    <div className={styles.panel}>
      <h2>{t('audioTranscription.title')}</h2>
      <p className={styles.hint}>{t('audioTranscription.description')}</p>
      <Checkbox checked={isChecked} label={t('audioTranscription.label')} onChange={handleChange} />
      {isChecked ? null : <p className={styles.hint}>{t('audioTranscription.offNotice')}</p>}
      <p className={styles.hint}>
        {limit.unit === 'minutes'
          ? t('audioTranscription.limit.minutes', { minutes: limit.value })
          : t('audioTranscription.limit.seconds', { seconds: limit.value })}
      </p>
      {mutation.isPending || mutation.isSuccess ? (
        <p className={styles.hint} role="status">
          {t(mutation.isPending ? 'audioTranscription.saving' : 'audioTranscription.saved')}
        </p>
      ) : null}
      {mutation.isError ? (
        <p className={styles.error} role="alert">
          {t('audioTranscription.error')}
        </p>
      ) : null}
    </div>
  )
}
