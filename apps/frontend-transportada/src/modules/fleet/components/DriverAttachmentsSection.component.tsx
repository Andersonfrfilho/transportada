/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useDriverAttachments } from '../hooks/useDriverAttachments.hook'
import {
  DRIVER_ATTACHMENT_ACCEPT,
  DRIVER_ATTACHMENT_MAX_BYTES,
  DRIVER_ATTACHMENT_TYPES,
  type DriverAttachmentType,
  willReplaceAttachment,
} from '../shared/driverAttachment.validation'
import type { LicenseSuggestionField } from '../shared/driverLicenseSuggestion.service'
import { FLEET_MANAGE_PERMISSION, FLEET_REVEAL_PERMISSION } from '../shared/fleet.constant'
import styles from '../styles/fleet.module.css'
import {
  DriverLicenseSuggestion,
  type DriverLicenseFields,
} from './DriverLicenseSuggestion.component'
import { FleetFeedback } from './FleetFeedback.component'

type DriverAttachmentsSectionProps = Readonly<{
  driverId: string
  /** O que o formulário da ficha tem agora nos campos da habilitação: a oferta só preenche os vazios. */
  licenseFields: DriverLicenseFields
  onFillLicenseField: (field: LicenseSuggestionField, value: string) => void
}>

/**
 * Spec 091: os documentos da ficha do motorista. A lista mostra tipo, data e quem anexou — saber que o
 * documento existe não é ver o documento. Anexar e remover é `fleet.manage`; abrir o arquivo é
 * `fleet.reveal`, e a tela só oferece o que a conta pode fazer.
 */
export function DriverAttachmentsSection({
  driverId,
  licenseFields,
  onFillLicenseField,
}: DriverAttachmentsSectionProps) {
  const { i18n, t } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
  })
  const permissions = useAuthMeQuery().data?.data.permissions ?? []
  const canManage = permissions.includes(FLEET_MANAGE_PERMISSION)
  const canReveal = permissions.includes(FLEET_REVEAL_PERMISSION)
  const [type, setType] = useState<DriverAttachmentType>('cnh')
  const [notice, setNotice] = useState<null | Readonly<{ isError: boolean; text: string }>>(null)
  const { listQuery, removeMutation, revealMutation, uploadMutation } = useDriverAttachments({
    driverId,
  })
  const attachments = listQuery.data ?? []
  const isBusy = uploadMutation.isPending || removeMutation.isPending
  const isReplacement = willReplaceAttachment(attachments, type)

  function errorText(error: unknown): string {
    const code = error instanceof Error ? error.message : ''
    const text = t(`driverAttachments.errors.${code}`, { defaultValue: '' })
    return text === '' ? t('driverAttachments.errors.default') : text
  }

  function handleSelect(file: File | undefined): void {
    if (file === undefined) return
    if (file.size > DRIVER_ATTACHMENT_MAX_BYTES) {
      setNotice({ isError: true, text: t('driverAttachments.errors.PAYLOAD_TOO_LARGE') })
      return
    }
    setNotice(null)
    uploadMutation.mutate(
      { file, type },
      {
        onError: (error) => setNotice({ isError: true, text: errorText(error) }),
        onSuccess: () =>
          setNotice({
            isError: false,
            text: t(isReplacement ? 'driverAttachments.replaced' : 'driverAttachments.attached'),
          }),
      },
    )
  }

  function handleRemove(attachmentId: string): void {
    setNotice(null)
    removeMutation.mutate(attachmentId, {
      onError: (error) => setNotice({ isError: true, text: errorText(error) }),
      onSuccess: () => setNotice({ isError: false, text: t('driverAttachments.removed') }),
    })
  }

  function handleOpen(attachmentId: string): void {
    setNotice(null)
    revealMutation.mutate(attachmentId, {
      onError: (error) => setNotice({ isError: true, text: errorText(error) }),
    })
  }

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
              <span className={styles.fuelPriceActions}>
                {canReveal ? (
                  <button
                    className={styles.secondaryAction}
                    disabled={revealMutation.isPending}
                    type="button"
                    onClick={() => handleOpen(attachment.id)}
                  >
                    <Icon name="download" />
                    {t('driverAttachments.open')}
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    className={styles.secondaryAction}
                    disabled={isBusy}
                    type="button"
                    onClick={() => handleRemove(attachment.id)}
                  >
                    <Icon name="trash" />
                    {t('driverAttachments.remove')}
                  </button>
                ) : null}
              </span>
              {canManage && attachment.hasSuggestion ? (
                <DriverLicenseSuggestion
                  attachmentId={attachment.id}
                  current={licenseFields}
                  driverId={driverId}
                  onFill={onFillLicenseField}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div className={styles.fuelPriceForm}>
          <Select
            ariaLabel={t('driverAttachments.typeLabel')}
            emptyLabel={t('driverAttachments.typeLabel')}
            options={DRIVER_ATTACHMENT_TYPES.map((option) => ({
              label: t(`driverAttachments.types.${option}`),
              value: option,
            }))}
            placeholder={t('driverAttachments.typeLabel')}
            searchPlaceholder={t('driverAttachments.typeLabel')}
            value={type}
            onChange={(value) => setType(value as DriverAttachmentType)}
          />
          <FileField
            accept={DRIVER_ATTACHMENT_ACCEPT}
            actionLabel={t(
              isReplacement ? 'driverAttachments.replaceFile' : 'driverAttachments.chooseFile',
            )}
            disabled={isBusy}
            label={t('driverAttachments.fileLabel')}
            placeholder={t('driverAttachments.filePlaceholder')}
            resetAfterSelect
            onSelect={handleSelect}
          />
          <small className={styles.fieldHint}>
            {t(isReplacement ? 'driverAttachments.replaceHint' : 'driverAttachments.fileHint')}
          </small>
        </div>
      ) : null}

      {notice === null ? null : (
        <FleetFeedback isError={notice.isError} reveal={false}>
          {notice.text}
        </FleetFeedback>
      )}
    </fieldset>
  )
}
