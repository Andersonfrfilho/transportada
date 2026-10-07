/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useRef, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoPreviewUpload } from '../hooks/useCargoPreviewUpload.hook'
import { CARGO_PREVIEW_NOT_ENABLED_CODE } from '../shared/cargoPreview.constant'
import { navigateToContractors } from '../shared/cargoReceivingRoute.service'
import { resolvePreviewErrorKeys } from '../shared/cargoPreviewRefusal.service'
import styles from '../styles/cargoReceiving.module.css'
import previewStyles from '../styles/cargoPreview.module.css'
import { CargoPreviewUploadFields } from './CargoPreviewUploadFields.component'
import { RegistrationRefusalSummary } from './RegistrationRefusalSummary.component'

/**
 * Enviar a planilha de prévia. A recusa do servidor chega nomeando TODOS os campos, cada um com atalho
 * (`web.md` §11), e o envio leva uma chave de idempotência por tentativa — repetir o mesmo envio não
 * duplica a prévia. Prévia desligada para o contratante explica o motivo e leva à ficha dele.
 */
export function CargoPreviewUploadPanel(): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const upload = useCargoPreviewUpload()
  const panelRef = useRef<HTMLElement>(null)
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const hasNamedRefusal = upload.refusal !== undefined && upload.refusal.fields.length > 0
  const hasNoContractor =
    !upload.contractors.isLoading && upload.contractors.contractors.length === 0
  const needsProfile = hasNoContractor || upload.errorCode === CARGO_PREVIEW_NOT_ENABLED_CODE

  return (
    <section className={previewStyles.upload} data-preview-upload="" ref={panelRef}>
      <h2 className={previewStyles.sectionTitle}>{t('preview.upload.title')}</h2>
      <CargoPreviewUploadFields upload={upload} />
      {hasNoContractor ? (
        <p className={previewStyles.notice}>{t('preview.upload.noEligibleContractor')}</p>
      ) : null}
      {upload.refusal === undefined ? null : (
        <RegistrationRefusalSummary panelRef={panelRef} refusal={upload.refusal} />
      )}
      {upload.errorCode === undefined || hasNamedRefusal ? null : (
        <p className={styles.error} role="alert">
          {t(resolvePreviewErrorKeys(upload.errorCode), {
            code: upload.errorCode,
          })}
        </p>
      )}
      {upload.existingPreview === undefined ? null : (
        <p className={previewStyles.notice} role="status">
          {t('preview.upload.alreadySent')}
          <Button onClick={upload.openExisting} type="button" variant="secondary">
            <Icon name="eye" />
            {t('preview.upload.openExisting')}
          </Button>
        </p>
      )}
      <div className={styles.actions}>
        <Button disabled={upload.isSubmitting} onClick={upload.submit} type="button">
          <Icon name="upload" />
          {upload.isSubmitting ? t('preview.upload.submitting') : t('preview.upload.submit')}
        </Button>
        {needsProfile ? (
          <Button onClick={() => navigateToContractors(navigator)} type="button" variant="ghost">
            <Icon name="organization" />
            {t('preview.upload.openContractors')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
