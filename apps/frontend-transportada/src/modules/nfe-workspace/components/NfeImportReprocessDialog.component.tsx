/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfeImportReprocessPreview } from '../shared/nfeWorkspaceClient.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeImportReprocessDialogProps = Readonly<{
  importId: string
  isSubmitting: boolean
  loadPreview: (input: Readonly<{ id: string }>) => Promise<NfeImportReprocessPreview>
  onCancel: () => void
  onConfirm: () => void
}>

/**
 * Spec 314: confirma o reprocesso mostrando quantas notas o servidor refaria. A contagem vem da
 * simulação da API (RF3/RF6) e nada é gravado antes de "Confirmar".
 */
export function NfeImportReprocessDialog({
  importId,
  isSubmitting,
  loadPreview,
  onCancel,
  onConfirm,
}: NfeImportReprocessDialogProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: true,
    onClose: isSubmitting ? () => undefined : onCancel,
  })
  const preview = useQuery({
    queryFn: () => loadPreview({ id: importId }),
    queryKey: ['nfe-import-reprocess-preview', importId],
    staleTime: 0,
  })
  const data = preview.data
  const canConfirm = data?.reprocessable === true && !isSubmitting

  function renderBody() {
    if (preview.isLoading) return <Skeleton />
    if (preview.isError || data === undefined)
      return (
        <p className={styles.feedbackError} role="alert">
          {t('imports.reprocessDialog.previewError')}
        </p>
      )
    if (data.busy) return <p>{t('imports.reprocessDialog.busy')}</p>
    if (!data.reprocessable) return <p>{t('imports.reprocessDialog.nothing')}</p>
    return (
      <p>
        {t('imports.reprocessDialog.count', { count: data.total })}
        {data.rejectedItems > 0 && (
          <span className={styles.secondaryText}>
            {' '}
            {t('imports.reprocessDialog.rejected', { count: data.rejectedItems })}
          </span>
        )}
        {data.failedItems > 0 && (
          <span className={styles.secondaryText}>
            {' '}
            {t('imports.reprocessDialog.failed', { count: data.failedItems })}
          </span>
        )}
      </p>
    )
  }

  return createPortal(
    <div className={styles.reprocessOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfe-reprocess-dialog-title"
        aria-modal="true"
        className={styles.reprocessDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.cteEmissionHeader}>
          <h2 id="nfe-reprocess-dialog-title">{t('imports.reprocessDialog.title')}</h2>
          <button
            aria-label={t('imports.reprocessDialog.cancel')}
            className={styles.iconAction}
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        {renderBody()}
        <footer className={styles.cteEmissionFooter}>
          <Button
            disabled={isSubmitting}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('imports.reprocessDialog.cancel')}
          </Button>
          <Button disabled={!canConfirm} onClick={onConfirm} size="sm" type="button">
            <Icon name="refresh" />
            {isSubmitting ? t('imports.reprocessPending') : t('imports.reprocessDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
