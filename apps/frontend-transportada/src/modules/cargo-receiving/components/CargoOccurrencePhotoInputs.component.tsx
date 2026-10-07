/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { FileField } from '@/components/ui/file-field'

import { CARGO_OCCURRENCE_IMAGE_MIME_PREFIX } from '../shared/cargoOccurrence.constant'

type CargoOccurrencePhotoInputsProps = Readonly<{
  describedBy: string | undefined
  fileName: string | undefined
  isDisabled: boolean
  isInvalid: boolean
  onSelect: (file: File) => void
}>

const ACCEPT = `${CARGO_OCCURRENCE_IMAGE_MIME_PREFIX}*`

/** Dois caminhos para a mesma foto: a câmera traseira na hora, ou uma imagem que já existe no aparelho. */
export function CargoOccurrencePhotoInputs({
  describedBy,
  fileName,
  isDisabled,
  isInvalid,
  onSelect,
}: CargoOccurrencePhotoInputsProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <>
      <FileField
        accept={ACCEPT}
        actionLabel={t('occurrence.photo.captureAction')}
        capture="environment"
        disabled={isDisabled}
        isInvalid={isInvalid}
        label={t('occurrence.photo.captureLabel')}
        onSelect={(file) => file !== undefined && onSelect(file)}
        placeholder={t('occurrence.photo.empty')}
        resetAfterSelect
        {...(describedBy === undefined ? {} : { describedBy })}
        {...(fileName === undefined ? {} : { fileName })}
      />
      <FileField
        accept={ACCEPT}
        actionLabel={t('occurrence.photo.galleryAction')}
        disabled={isDisabled}
        label={t('occurrence.photo.galleryLabel')}
        onSelect={(file) => file !== undefined && onSelect(file)}
        placeholder={t('occurrence.photo.galleryEmpty')}
        resetAfterSelect
      />
    </>
  )
}
