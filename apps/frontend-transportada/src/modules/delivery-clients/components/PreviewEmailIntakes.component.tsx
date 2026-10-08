/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { usePreviewEmailIntakesQuery } from '../queries/usePreviewEmailIntakes.query'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'
import { PreviewEmailIntakeRow } from './PreviewEmailIntakeRow.component'

const DEFAULT_LOCALE = 'pt-BR'

type PreviewEmailIntakesProps = Readonly<{ contractorId: string }>

/**
 * "O e-mail não chegou: por quê?" — os últimos e-mails que casaram o endereço, com o motivo da recusa. A
 * tabela só tem código e resultado: a API nunca guardou endereço, nome, assunto nem corpo.
 */
export function PreviewEmailIntakes({ contractorId }: PreviewEmailIntakesProps): JSX.Element {
  const { i18n, t } = useTranslation('previewEmail')
  const intakes = usePreviewEmailIntakesQuery(contractorId)
  const titleId = useId()
  const locale = i18n.resolvedLanguage ?? DEFAULT_LOCALE

  return (
    <section aria-labelledby={titleId} className={previewStyles.subsection}>
      <header className={previewStyles.subsectionHeader}>
        <h5 id={titleId}>{t('intakes.title')}</h5>
        <p className={styles.hint}>{t('intakes.intro')}</p>
      </header>
      {intakes.isPending ? (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="6rem" />
        </SkeletonGroup>
      ) : intakes.isError ? (
        <p className={styles.error} role="alert">
          {t('loadError', { code: intakes.error.message })}
        </p>
      ) : intakes.data.length === 0 ? (
        <p className={styles.hint}>{t('intakes.empty')}</p>
      ) : (
        <div className={previewStyles.tableScroll}>
          <table aria-labelledby={titleId} className={previewStyles.table}>
            <thead>
              <tr>
                <th scope="col">{t('intakes.columns.date')}</th>
                <th scope="col">{t('intakes.columns.outcome')}</th>
                <th scope="col">{t('intakes.columns.reason')}</th>
                <th scope="col">{t('intakes.columns.preview')}</th>
              </tr>
            </thead>
            <tbody>
              {intakes.data.map((intake, index) => (
                <PreviewEmailIntakeRow
                  intake={intake}
                  key={`${intake.receivedAt}:${index}`}
                  locale={locale}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
