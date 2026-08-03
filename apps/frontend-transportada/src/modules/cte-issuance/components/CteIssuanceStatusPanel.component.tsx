/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CteIssuanceTimelineItem } from '../shared/cteIssuanceTimeline.service'
import type { CteIssuanceViewModel } from '../shared/cteIssuanceViewModel.service'
import styles from '../styles/cteIssuance.module.css'

const EMPTY_VALUE = '—'
const UNRESOLVED_STATUSES: readonly string[] = ['error', 'forbidden', 'loading']

export type CteIssuanceTracking = Readonly<{
  downloadErrorCode?: string | undefined
  isDownloading: boolean
  isReprocessing: boolean
  timeline: readonly CteIssuanceTimelineItem[]
  viewModel: CteIssuanceViewModel
}>

type CteIssuanceStatusPanelProps = Readonly<{
  onClose: () => void
  onDownload: () => void
  onReprocess: () => void
  tracking: CteIssuanceTracking
}>

export function CteIssuanceStatusPanel({
  onClose,
  onDownload,
  onReprocess,
  tracking,
}: CteIssuanceStatusPanelProps) {
  const { t } = useTranslation('cteIssuance')
  const { viewModel } = tracking

  function renderTimelineItem(item: CteIssuanceTimelineItem) {
    const namespaced = (key: string) => t(key.replace('cteIssuance.', ''))
    return (
      <li
        className={`${styles.timelineItem} ${item.status === 'authorized' ? styles.timelineItemReady : ''}`}
        key={item.status}
      >
        <p className={styles.timelineTitle}>{namespaced(item.titleKey)}</p>
        <p className={styles.timelineDescription}>{namespaced(item.descriptionKey)}</p>
      </li>
    )
  }

  function renderFact(input: { readonly label: string; readonly value?: string | undefined }) {
    return (
      <div className={styles.fact} key={input.label}>
        <span className={styles.factLabel}>{t(input.label)}</span>
        <span className={styles.factValue}>{input.value ?? EMPTY_VALUE}</span>
      </div>
    )
  }

  return (
    <section className={styles.issuancePanel} aria-labelledby="cte-issuance-status-title">
      <div className={styles.panelHead}>
        <h3 id="cte-issuance-status-title">{t('panel.title')}</h3>
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('actions.close')}
        </Button>
      </div>

      {viewModel.status === 'forbidden' ? (
        <p className={styles.hint} role="alert">
          {t('panel.forbidden')}
        </p>
      ) : null}
      {viewModel.status === 'loading' ? <p className={styles.hint}>{t('panel.loading')}</p> : null}
      {viewModel.status === 'error' ? (
        <p className={styles.alert} role="alert">
          {t('panel.error')}
        </p>
      ) : null}

      {viewModel.issuance === undefined ? null : (
        <>
          <ol className={styles.timeline}>{tracking.timeline.map(renderTimelineItem)}</ol>

          <div className={styles.factGrid}>
            {renderFact({ label: 'panel.accessKey', value: viewModel.accessKey })}
            {renderFact({ label: 'panel.protocol', value: viewModel.protocol })}
            {renderFact({
              label: 'panel.environment',
              value: t(`environment.${viewModel.issuance.environment}`),
            })}
            {renderFact({ label: 'panel.updatedAt', value: viewModel.issuance.updatedAt })}
            {renderFact({ label: 'panel.rejectionCode', value: viewModel.rejectionCode })}
            {renderFact({ label: 'panel.rejectionCause', value: viewModel.rejectionCause })}
          </div>

          {viewModel.shouldPollStatus === true ? (
            <p className={styles.hint}>{t('panel.polling')}</p>
          ) : null}

          <div className={styles.panelActions}>
            {viewModel.canDownloadXml === true ? (
              <Button
                disabled={tracking.isDownloading}
                onClick={onDownload}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Icon name="download" />
                {t('actions.download')}
              </Button>
            ) : null}
            {viewModel.canReprocess === true ? (
              <Button
                disabled={tracking.isReprocessing}
                onClick={onReprocess}
                size="sm"
                type="button"
              >
                <Icon name="refresh" />
                {t('actions.reprocess')}
              </Button>
            ) : null}
          </div>

          {tracking.downloadErrorCode === undefined ? null : (
            <p className={styles.alert} role="alert">
              {t('errors.download')}
            </p>
          )}
        </>
      )}

      {!UNRESOLVED_STATUSES.includes(viewModel.status) && viewModel.issuance === undefined ? (
        <p className={styles.hint}>{t('panel.empty')}</p>
      ) : null}
    </section>
  )
}
