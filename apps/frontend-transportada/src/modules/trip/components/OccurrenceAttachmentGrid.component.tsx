/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'

import {
  capOccurrenceAttachments,
  resolveOccurrenceAttachmentDisplay,
  resolveOccurrenceAttachmentOriginal,
} from '../shared/occurrenceAttachmentGrid.service'
import type { OccurrenceAttachment } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

type OccurrenceAttachmentGridProps = Readonly<{
  attachments: readonly OccurrenceAttachment[]
  /** A data impressa no selo de foto expirada — a data do registro da ocorrência (D11). */
  occurrenceCreatedAt: string
}>

/**
 * Spec 161 T24 (RF9/RF10/RF11/RF13/RF14/RF32/RF32b, CA6b): a grade de miniaturas usada no painel
 * da nota, no feed `/ocorrencias` e no detalhe da ocorrência. Pede a miniatura e só busca o
 * original ao abrir a foto; anexo sem miniatura cai para o original; esqueleto até a imagem
 * carregar; falha de uma foto vira selo sem derrubar as outras; anexo `expired` nunca vira
 * `<img>`.
 */
export function OccurrenceAttachmentGrid({
  attachments,
  occurrenceCreatedAt,
}: OccurrenceAttachmentGridProps) {
  const { t } = useTranslation('trip')
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(new Set())
  const [erroredIds, setErroredIds] = useState<ReadonlySet<string>>(new Set())
  const [fullscreenUrl, setFullscreenUrl] = useState<null | string>(null)

  const visible = capOccurrenceAttachments(attachments)
  if (visible.length === 0) return null

  return (
    <div className={styles.occurrenceAttachmentGrid}>
      {visible.map((attachment) => {
        const display = resolveOccurrenceAttachmentDisplay(attachment)
        const original = resolveOccurrenceAttachmentOriginal(attachment)
        const hasErrored = erroredIds.has(attachment.id)
        const hasLoaded = loadedIds.has(attachment.id)

        if (display.kind === 'expired') {
          return (
            <div className={styles.occurrenceAttachmentBadge} key={attachment.id}>
              <span>{t('occurrenceFeed.detail.photoExpired')}</span>
              <span>{momentFormatter.format(new Date(occurrenceCreatedAt))}</span>
            </div>
          )
        }

        if (display.kind === 'unavailable' || hasErrored) {
          return (
            <div className={styles.occurrenceAttachmentBadge} key={attachment.id}>
              <span>{t('occurrenceFeed.detail.photoLoadError')}</span>
            </div>
          )
        }

        return (
          <button
            className={styles.occurrenceAttachmentButton}
            disabled={original === null}
            key={attachment.id}
            onClick={() => original !== null && setFullscreenUrl(original)}
            type="button"
          >
            {hasLoaded ? null : (
              <Skeleton
                className={styles.occurrenceAttachmentSkeleton}
                height="100%"
                width="100%"
              />
            )}
            <img
              alt={t('occurrenceFeed.detail.photoAlt')}
              className={styles.occurrenceAttachmentThumb}
              hidden={!hasLoaded}
              loading="lazy"
              onError={() => setErroredIds((previous) => new Set(previous).add(attachment.id))}
              onLoad={() => setLoadedIds((previous) => new Set(previous).add(attachment.id))}
              src={display.src}
            />
          </button>
        )
      })}
      {fullscreenUrl === null ? null : (
        <button
          aria-label={t('occurrenceFeed.detail.closePhoto')}
          className={styles.occurrencePhotoOverlay}
          onClick={() => setFullscreenUrl(null)}
          type="button"
        >
          <img
            alt={t('occurrenceFeed.detail.photoAlt')}
            className={styles.occurrencePhotoFull}
            src={fullscreenUrl}
          />
        </button>
      )}
    </div>
  )
}
