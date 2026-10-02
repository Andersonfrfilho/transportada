/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T2.6, RF-A4/RF-A5: a conferência de canhotos em maço. A tela **não aprova o que não
 * mostrou**: as fotos carregam já, e o botão só vale quando todas as marcadas chegaram. Montado só
 * enquanto aberto, então cada abertura começa do zero — tudo marcado, nada carregado.
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CanhotoBatchItem } from '../shared/canhotoBatchSelection.service'
import styles from '../styles/trip.module.css'
import type { ProofImageOutcome } from './ProofImage.component'
import { ProofGalleryDialog } from './ProofGalleryDialog.component'
import { TripCanhotoBatchItem } from './TripCanhotoBatchItem.component'

const TITLE_ID = 'trip-canhoto-batch-dialog-title'

export type CanhotoBatchDialogStatus = 'failed' | 'loading' | 'ready' | 'submitting'

type TripCanhotoBatchDialogProps = Readonly<{
  items: readonly CanhotoBatchItem[]
  onClose: () => void
  onConfirm: (documentIds: readonly string[]) => void
  /** Canhotos pendentes que passaram do teto de itens — ficam para a rodada seguinte. */
  overflowCount: number
  status: CanhotoBatchDialogStatus
}>

function addTo(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  return new Set([...current, value])
}

function removeFrom(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  return new Set([...current].filter((candidate) => candidate !== value))
}

export function TripCanhotoBatchDialog({
  items,
  onClose,
  onConfirm,
  overflowCount,
  status,
}: TripCanhotoBatchDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const [uncheckedIds, setUncheckedIds] = useState<ReadonlySet<string>>(new Set())
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(new Set())
  const [openedItem, setOpenedItem] = useState<CanhotoBatchItem | undefined>(undefined)

  const checkedItems = items.filter((item) => !uncheckedIds.has(item.documentId))
  const isWaitingImages = checkedItems.some((item) => !loadedIds.has(item.documentId))
  const isSubmitting = status === 'submitting'
  const canConfirm = status === 'ready' && checkedItems.length > 0 && !isWaitingImages

  function handleCheckedChange(documentId: string, isChecked: boolean): void {
    setUncheckedIds((current) =>
      isChecked ? removeFrom(current, documentId) : addTo(current, documentId),
    )
  }

  function handleImageSettled(documentId: string, outcome: ProofImageOutcome): void {
    if (outcome === 'loaded') setLoadedIds((current) => addTo(current, documentId))
  }

  function handleOpenImage(proofId: string): void {
    setOpenedItem(items.find((item) => item.proof.id === proofId))
  }

  function handleConfirm(): void {
    onConfirm(checkedItems.map((item) => item.documentId))
  }

  return createPortal(
    <>
      <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
        <div
          aria-labelledby={TITLE_ID}
          aria-modal="true"
          className={`${styles.mdfeGateDialog} ${styles.canhotoBatchDialog}`}
          ref={dialogRef}
          role="dialog"
          tabIndex={-1}
        >
          <header className={styles.mdfeGateHeader}>
            <div>
              <h2 id={TITLE_ID}>{t('deliveryProof.canhotoBatch.title')}</h2>
              <p className={styles.mdfeGateSubtitle}>{t('deliveryProof.canhotoBatch.subtitle')}</p>
            </div>
            <button
              aria-label={t('deliveryProof.canhotoBatch.close')}
              className={styles.iconAction}
              onClick={onClose}
              type="button"
            >
              <Icon name="close" />
            </button>
          </header>

          {status === 'loading' ? (
            <SkeletonGroup label={t('deliveryProof.canhotoBatch.loading')}>
              <Skeleton className={styles.canhotoBatchPlaceholder} />
            </SkeletonGroup>
          ) : null}
          {status === 'failed' ? (
            <p className={styles.alert} role="alert">
              {t('deliveryProof.canhotoBatch.loadFailed')}
            </p>
          ) : null}
          {(status === 'ready' || isSubmitting) && items.length === 0 ? (
            <p className={styles.hint}>{t('deliveryProof.canhotoBatch.empty')}</p>
          ) : null}

          {items.length === 0 ? null : (
            <ul className={styles.canhotoBatchGrid}>
              {items.map((item) => (
                <TripCanhotoBatchItem
                  actions={{
                    onCheckedChange: handleCheckedChange,
                    onImageSettled: handleImageSettled,
                    onOpenImage: handleOpenImage,
                  }}
                  isChecked={!uncheckedIds.has(item.documentId)}
                  item={item}
                  key={item.documentId}
                />
              ))}
            </ul>
          )}

          {overflowCount > 0 ? (
            <p className={styles.hint} role="status">
              {t('deliveryProof.canhotoBatch.overflow', { count: overflowCount })}
            </p>
          ) : null}

          <footer className={styles.mdfeGateFooter}>
            {items.length === 0 ? null : (
              <p aria-live="polite" className={styles.canhotoBatchSummary} role="status">
                {t('deliveryProof.canhotoBatch.checkedCount', {
                  checked: checkedItems.length,
                  total: items.length,
                })}
                {isWaitingImages && checkedItems.length > 0
                  ? ` · ${t('deliveryProof.canhotoBatch.waitingImages')}`
                  : null}
              </p>
            )}
            <Button onClick={onClose} size="sm" type="button" variant="ghost">
              <Icon name="close" />
              {t('deliveryProof.canhotoBatch.cancel')}
            </Button>
            {items.length === 0 ? null : (
              <Button disabled={!canConfirm} onClick={handleConfirm} size="sm" type="button">
                <Icon name="check" />
                {isSubmitting
                  ? t('deliveryProof.canhotoBatch.approving')
                  : t('deliveryProof.canhotoBatch.approve', { count: checkedItems.length })}
              </Button>
            )}
          </footer>
        </div>
      </div>
      {openedItem === undefined ? null : (
        <ProofGalleryDialog
          gallery={[openedItem.proof]}
          initialIndex={0}
          onClose={() => setOpenedItem(undefined)}
        />
      )}
    </>,
    document.body,
  )
}
