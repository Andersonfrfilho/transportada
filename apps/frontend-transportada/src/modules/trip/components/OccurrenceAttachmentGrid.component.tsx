/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import {
  capOccurrenceAttachments,
  resolveOccurrenceAttachmentDisplay,
  resolveOccurrenceAttachmentOriginal,
} from '../shared/occurrenceAttachmentGrid.service'
import {
  findOccurrenceAttachmentById,
  resolveOccurrenceAttachmentRefresh,
} from '../shared/occurrenceAttachmentRefresh.service'
import type { OccurrenceAttachment } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

type RefreshAttachments = () => Promise<readonly OccurrenceAttachment[]>

type OccurrenceAttachmentGridProps = Readonly<{
  attachments: readonly OccurrenceAttachment[]
  /** A data impressa no selo de foto expirada — a data do registro da ocorrência (D11). */
  occurrenceCreatedAt: string
  /**
   * Relê as URLs assinadas desta ocorrência. A grade a chama sozinha quando uma foto vence ou
   * falha, e de novo quando o usuário toca "tentar de novo" — sempre a lista inteira, porque é o
   * que a rota de anexos serve; cada célula fica só com o anexo de mesmo id.
   */
  onRefresh: RefreshAttachments
}>

type AttachmentCellProps = Readonly<{
  attachment: OccurrenceAttachment
  occurrenceCreatedAt: string
  onOpen: (url: string) => void
  onRefresh: RefreshAttachments
}>

/**
 * Uma foto, com o próprio estado de carga, falha e releitura — a falha de uma nunca derruba as
 * vizinhas, e é por isso que o estado mora aqui e não na grade.
 */
function AttachmentCell({
  attachment,
  occurrenceCreatedAt,
  onOpen,
  onRefresh,
}: AttachmentCellProps) {
  const { t } = useTranslation('trip')
  const [current, setCurrent] = useState(attachment)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [hasErrored, setHasErrored] = useState(false)
  const [attemptCount, setAttemptCount] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshReason = resolveOccurrenceAttachmentRefresh({
    attachment: current,
    attemptCount,
    hasErrored,
    now: Date.now(),
  })

  const runRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const refreshed = findOccurrenceAttachmentById(await onRefresh(), attachment.id)
      if (refreshed !== undefined) {
        setCurrent(refreshed)
        setHasLoaded(false)
      }
      setHasErrored(false)
    } catch {
      setHasErrored(true)
    } finally {
      setAttemptCount((previous) => previous + 1)
      setIsRefreshing(false)
    }
  }, [attachment.id, onRefresh])

  useEffect(() => {
    if (refreshReason === null || isRefreshing) return
    void runRefresh()
  }, [isRefreshing, refreshReason, runRefresh])

  const display = resolveOccurrenceAttachmentDisplay(current)
  const original = resolveOccurrenceAttachmentOriginal(current)

  if (display.kind === 'expired') {
    return (
      <div className={styles.occurrenceAttachmentBadge}>
        <span>{t('occurrenceFeed.detail.photoExpired')}</span>
        <span>{momentFormatter.format(new Date(occurrenceCreatedAt))}</span>
      </div>
    )
  }

  if (isRefreshing || refreshReason !== null) {
    return <Skeleton className={styles.occurrenceAttachmentSkeleton} height="100%" width="100%" />
  }

  /**
   * A frase morta virou frase com saída: depois da releitura automática, quem decide tentar de
   * novo é o usuário — e o botão zera o teto só desta foto.
   */
  if (display.kind === 'unavailable' || hasErrored) {
    return (
      <div className={styles.occurrenceAttachmentBadge}>
        <span>{t('occurrenceFeed.detail.photoLoadError')}</span>
        <Button
          onClick={() => {
            setAttemptCount(0)
            setHasErrored(true)
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="refresh" />
          {t('occurrenceFeed.detail.photoRetry')}
        </Button>
      </div>
    )
  }

  return (
    <button
      className={styles.occurrenceAttachmentButton}
      disabled={original === null}
      onClick={() => original !== null && onOpen(original)}
      type="button"
    >
      {hasLoaded ? null : (
        <Skeleton className={styles.occurrenceAttachmentSkeleton} height="100%" width="100%" />
      )}
      <img
        alt={t('occurrenceFeed.detail.photoAlt')}
        className={styles.occurrenceAttachmentThumb}
        hidden={!hasLoaded}
        loading="lazy"
        onError={() => setHasErrored(true)}
        onLoad={() => setHasLoaded(true)}
        src={display.src}
      />
    </button>
  )
}

/**
 * Spec 161 T24 (RF9/RF10/RF11/RF13/RF14/RF32/RF32b, CA6b): a grade de miniaturas usada no painel
 * da nota, no feed `/ocorrencias` e no detalhe da ocorrência. Pede a miniatura e só busca o
 * original ao abrir a foto; anexo sem miniatura cai para o original; esqueleto até a imagem
 * carregar; falha de uma foto vira selo sem derrubar as outras; anexo `expired` nunca vira
 * `<img>`.
 *
 * A URL assinada vence em cinco minutos: a célula que vence ou falha relê as URLs sozinha, uma
 * vez, e só então mostra a falha — com botão de tentar de novo.
 */
export function OccurrenceAttachmentGrid({
  attachments,
  occurrenceCreatedAt,
  onRefresh,
}: OccurrenceAttachmentGridProps) {
  const { t } = useTranslation('trip')
  const [fullscreenUrl, setFullscreenUrl] = useState<null | string>(null)
  /** Cinco fotos vencem juntas: uma releitura em voo serve as cinco, em vez de cinco requisições. */
  const inFlightRef = useRef<null | Promise<readonly OccurrenceAttachment[]>>(null)

  const refreshOnce = useCallback<RefreshAttachments>(() => {
    if (inFlightRef.current === null) {
      const request = onRefresh()
      inFlightRef.current = request
      void request.then(
        () => {
          inFlightRef.current = null
        },
        () => {
          inFlightRef.current = null
        },
      )
    }
    return inFlightRef.current
  }, [onRefresh])

  const visible = capOccurrenceAttachments(attachments)
  if (visible.length === 0) return null

  return (
    <div className={styles.occurrenceAttachmentGrid}>
      {visible.map((attachment) => (
        <AttachmentCell
          attachment={attachment}
          key={attachment.id}
          occurrenceCreatedAt={occurrenceCreatedAt}
          onOpen={setFullscreenUrl}
          onRefresh={refreshOnce}
        />
      ))}
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
