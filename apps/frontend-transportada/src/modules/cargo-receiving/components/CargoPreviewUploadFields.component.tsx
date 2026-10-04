/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'
import { SearchableSelect } from '@/components/ui/searchable-select'

import type { CargoPreviewUploadController } from '../hooks/useCargoPreviewUpload.hook'
import {
  CARGO_PREVIEW_ACCEPT_ATTRIBUTE,
  CARGO_PREVIEW_FORM_FIELDS,
  CARGO_PREVIEW_LIMITS,
} from '../shared/cargoPreview.constant'
import styles from '../styles/cargoReceiving.module.css'
import previewStyles from '../styles/cargoPreview.module.css'

type CargoPreviewUploadFieldsProps = Readonly<{ upload: CargoPreviewUploadController }>

const MAX_KIB = CARGO_PREVIEW_LIMITS.fileMaxBytes / 1024

function FieldIssue({
  field,
  id,
  upload,
}: Readonly<{
  field: keyof typeof CARGO_PREVIEW_FORM_FIELDS
  id: string
  upload: CargoPreviewUploadController
}>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  const issue = upload.feedback.issueFor(field)
  if (issue === undefined) return null
  return (
    <p className={styles.error} id={id} role="alert">
      {t([`preview.issues.${field}.${issue.code}`, `issues.${issue.code}`], { max: issue.max })}
    </p>
  )
}

/** Contratante (só com recebimento e prévia ligados) e a planilha — as duas coisas que o envio pede. */
export function CargoPreviewUploadFields({ upload }: CargoPreviewUploadFieldsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const fileIssueId = `${useId()}-file-issue`
  const contractorIssueId = `${useId()}-contractor-issue`
  const { contractors } = upload

  return (
    <div className={previewStyles.uploadFields}>
      <div
        className={styles.fieldGroup}
        data-field={CARGO_PREVIEW_FORM_FIELDS.contractorId}
        tabIndex={-1}
      >
        <span>{t('preview.upload.contractor')}</span>
        <SearchableSelect
          ariaLabel={t('preview.upload.contractor')}
          disabled={contractors.isLoading}
          emptyLabel={t('preview.upload.contractorEmpty')}
          onChange={upload.selectContractor}
          options={contractors.contractors.map((contractor) => ({
            label: contractor.displayName,
            value: contractor.id,
          }))}
          placeholder={
            contractors.isLoading
              ? t('preview.upload.contractorsLoading')
              : t('preview.upload.contractorPlaceholder')
          }
          searchPlaceholder={t('preview.upload.contractorSearch')}
          value={upload.contractorId}
        />
        <p className={styles.hint}>{t('preview.upload.contractorHint')}</p>
        <FieldIssue field="contractorId" id={contractorIssueId} upload={upload} />
      </div>
      <div className={styles.fieldGroup} data-field={CARGO_PREVIEW_FORM_FIELDS.file}>
        <FileField
          accept={CARGO_PREVIEW_ACCEPT_ATTRIBUTE}
          actionLabel={t('preview.upload.chooseFile')}
          describedBy={upload.feedback.issueFor('file') === undefined ? undefined : fileIssueId}
          isInvalid={upload.feedback.issueFor('file') !== undefined}
          label={t('preview.fields.file')}
          onSelect={upload.selectFile}
          placeholder={t('preview.upload.noFile')}
          {...(upload.file === undefined ? {} : { fileName: upload.file.name })}
        />
        <p className={styles.hint}>{t('preview.upload.fileHint', { max: MAX_KIB })}</p>
        <FieldIssue field="file" id={fileIssueId} upload={upload} />
      </div>
    </div>
  )
}
