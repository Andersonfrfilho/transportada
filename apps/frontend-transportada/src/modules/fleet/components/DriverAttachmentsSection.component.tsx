/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useDriverAttachments } from '../hooks/useDriverAttachments.hook'
import styles from '../styles/fleet.module.css'
import { FleetFeedback } from './FleetFeedback.component'

type DriverAttachmentsSectionProps = Readonly<{ driverId: string }>

/**
 * Spec 091: os documentos da ficha do motorista. A lista mostra tipo, data e quem anexou — saber que o
 * documento existe não é ver o documento, e o arquivo só abre para quem tem `fleet.reveal`.
 */
export function DriverAttachmentsSection({ driverId }: DriverAttachmentsSectionProps) {
  const { i18n, t } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
  })
  const { listQuery } = useDriverAttachments({ driverId })
  const attachments = listQuery.data ?? []

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverAttachments.title')}</legend>
      <p className={styles.hint}>{t('driverAttachments.hint')}</p>

      {listQuery.isPending ? (
        <SkeletonGroup label={t('driverAttachments.title')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      ) : listQuery.isError ? (
        <FleetFeedback isError reveal={false}>
          {t('driverAttachments.loadError')}
        </FleetFeedback>
      ) : attachments.length === 0 ? (
        <p>{t('driverAttachments.empty')}</p>
      ) : (
        <ul>
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <strong>{t(`driverAttachments.types.${attachment.type}`)}</strong>{' '}
              {t('driverAttachments.meta', {
                date: formatter.format(new Date(attachment.createdAt)),
                name: attachment.uploadedBy.name ?? t('driverAttachments.unknownUser'),
              })}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
