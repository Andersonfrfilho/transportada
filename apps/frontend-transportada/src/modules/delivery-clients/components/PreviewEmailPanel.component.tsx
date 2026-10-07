/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { usePreviewEmailSettingsQuery } from '../queries/usePreviewEmailSettings.query'
import styles from '../styles/contractorDirectory.module.css'
import previewStyles from '../styles/previewEmail.module.css'
import { PreviewEmailAddressControl } from './PreviewEmailAddressControl.component'
import { PreviewEmailAllowlistsForm } from './PreviewEmailAllowlistsForm.component'
import { PreviewEmailIntakes } from './PreviewEmailIntakes.component'
import { PreviewEmailStatus } from './PreviewEmailStatus.component'

type PreviewEmailPanelProps = Readonly<{ contractorId: string }>

/**
 * Spec 237 T4.6b (ADR-0094 §10): a entrada da prévia por e-mail encaminhado — o endereço (gerado no servidor,
 * mostrado uma vez), as duas listas de quem pode enviar e as recusas recentes. Só é montada para quem gere as
 * configurações: a API também exige `settings.manage` para ler.
 */
export function PreviewEmailPanel({ contractorId }: PreviewEmailPanelProps): JSX.Element {
  const { t } = useTranslation('previewEmail')
  const settings = usePreviewEmailSettingsQuery(contractorId)
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className={previewStyles.section}>
      <header className={previewStyles.sectionHeader}>
        <h4 id={titleId}>{t('title')}</h4>
        <p className={styles.hint}>{t('intro')}</p>
      </header>

      {settings.isPending ? (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="10rem" />
        </SkeletonGroup>
      ) : settings.isError ? (
        <p className={styles.error} role="alert">
          {t('loadError', { code: settings.error.message })}
        </p>
      ) : (
        <>
          <PreviewEmailStatus settings={settings.data} />
          <PreviewEmailAllowlistsForm contractorId={contractorId} settings={settings.data} />
          <PreviewEmailAddressControl contractorId={contractorId} settings={settings.data} />
        </>
      )}

      <PreviewEmailIntakes contractorId={contractorId} />
    </section>
  )
}
