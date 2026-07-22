/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { NfeDocumentListItem } from '../shared/nfeWorkspaceClient.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeDocumentListProps = Readonly<{
  readonly documents: readonly NfeDocumentListItem[]
  readonly onDownloadXml: (id: string) => void
}>

export function NfeDocumentList({ documents, onDownloadXml }: NfeDocumentListProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-documents-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-documents-title">{t('documents.title')}</h2>
        <p>{t('documents.subtitle')}</p>
      </div>
      <div className={styles.documentList}>
        {documents.length === 0 && <p className={styles.emptyState}>{t('documents.empty')}</p>}
        {documents.map((document) => (
          <article className={styles.documentRow} key={document.id}>
            <div>
              <strong>{document.number}</strong>
              <p>{document.operationNature}</p>
              <p className={styles.secondaryText}>{document.accessKey}</p>
            </div>
            <div className={styles.documentMeta}>
              <span>{t(`documentStatus.${document.status}`)}</span>
              <span>{document.totalValue}</span>
            </div>
            <button
              className={styles.ghostAction}
              onClick={() => onDownloadXml(document.id)}
              type="button"
            >
              {t('documents.downloadXml')}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
