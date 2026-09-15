/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  addressCorrectionMailErrorHasConfigurationShortcut,
  addressCorrectionMailErrorMessageKey,
} from '../shared/addressCorrectionMail.service'
import {
  createBrowserWorkspaceNavigator,
  navigateToDeliveryClients,
} from '../shared/deliveryClientsNavigation.service'
import type { UseAddressCorrectionMailDialogResult } from '../hooks/useAddressCorrectionMailDialog.hook'
import styles from '../styles/addressReport.module.css'

type AddressCorrectionMailDialogProps = Readonly<{
  dialog: UseAddressCorrectionMailDialogResult
}>

export function AddressCorrectionMailDialog({ dialog }: AddressCorrectionMailDialogProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen || dialog.target === null) return null

  const target = dialog.target
  const isUnit = target.requestIds !== undefined
  const isFinished = dialog.result !== null
  const hasNoActiveContact =
    !dialog.recipientsLoading && !dialog.recipientsFailed && dialog.contacts.length === 0
  const hasNoTemplate =
    !dialog.templatesLoading && !dialog.templatesFailed && dialog.templates.length === 0
  const hasConfigurationShortcut =
    dialog.errorCode !== null &&
    addressCorrectionMailErrorHasConfigurationShortcut(dialog.errorCode)

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página, e o
  // `position: fixed` deixaria de se referir à viewport — mesmo cuidado de `BillingBulkCancelDialog`.
  return createPortal(
    <div className={styles.mailOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="address-correction-mail-title"
        aria-modal="true"
        className={styles.mailDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mailHeader}>
          <div>
            <h2 id="address-correction-mail-title">
              {t(
                isUnit
                  ? 'addressReport.correction.mail.titleUnit'
                  : 'addressReport.correction.mail.titleComplete',
              )}
            </h2>
            <p className={styles.mailSubtitle}>{target.contractorName}</p>
          </div>
          <button
            aria-label={t('addressReport.correction.mail.close')}
            className={styles.mailIconAction}
            onClick={dialog.close}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <section className={styles.mailSection}>
          <h3 className={styles.mailSectionTitle}>
            {t('addressReport.correction.mail.previewTitle', { count: target.previewItems.length })}
          </h3>
          <ul className={styles.mailPreviewList}>
            {target.previewItems.map((item) => (
              <li className={styles.mailPreviewItem} key={item.addressKey}>
                <span>
                  {t('addressReport.correction.mail.previewAsIs')}: {item.asIs}
                </span>
                <span>
                  {t('addressReport.correction.mail.previewProposed')}: {item.proposed}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.mailSection}>
          <h3 className={styles.mailSectionTitle}>
            {t('addressReport.correction.mail.contactsTitle')}
          </h3>

          {dialog.recipientsFailed ? (
            <p className={styles.mailWarning} role="alert">
              {t('addressReport.correction.mail.contactsUnavailable')}
            </p>
          ) : null}

          {dialog.recipientsLoading ? (
            <SkeletonGroup label={t('addressReport.correction.mail.contactsTitle')}>
              <Skeleton height="1.2rem" variant="text" width="70%" />
              <Skeleton height="1.2rem" variant="text" width="50%" />
            </SkeletonGroup>
          ) : null}

          {hasNoActiveContact ? (
            <p className={styles.mailNotice}>
              {t('addressReport.correction.mail.noActiveContact')}{' '}
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => navigateToDeliveryClients(createBrowserWorkspaceNavigator())}
              >
                {t('addressReport.correction.mail.noActiveContactLink')}
              </Button>
            </p>
          ) : null}

          {dialog.contacts.length === 0 ? null : (
            <ul className={styles.mailContactList}>
              {dialog.contacts.map((contact) => (
                <li key={contact.id}>
                  <Checkbox
                    checked={dialog.selectedContactIds.includes(contact.id)}
                    disabled={dialog.isSending || isFinished}
                    label={<span className={styles.mailContactEmail}>{contact.email}</span>}
                    onChange={() => dialog.toggleContact(contact.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.mailSection}>
          <h3 className={styles.mailSectionTitle}>
            {t('addressReport.correction.mail.templateTitle')}
          </h3>

          {dialog.templatesFailed ? (
            <p className={styles.mailWarning} role="alert">
              {t('addressReport.correction.mail.templateUnavailable')}
            </p>
          ) : null}

          {dialog.templatesLoading ? (
            <SkeletonGroup label={t('addressReport.correction.mail.templateTitle')}>
              <Skeleton height="var(--field-height)" variant="text" width="100%" />
            </SkeletonGroup>
          ) : null}

          {hasNoTemplate ? (
            <p className={styles.mailNotice}>
              {t('addressReport.correction.mail.error.templateMissing')}{' '}
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => navigateToDeliveryClients(createBrowserWorkspaceNavigator())}
              >
                {t('addressReport.correction.mail.openMailSettingsLink')}
              </Button>
            </p>
          ) : null}

          {dialog.templates.length === 0 ? null : (
            <>
              <Select
                ariaLabel={t('addressReport.correction.mail.templateTitle')}
                disabled={dialog.isSending || isFinished}
                onChange={dialog.selectTemplate}
                options={dialog.templates.map((template) => ({
                  label: template.isDefault
                    ? t('addressReport.correction.mail.templateDefaultOption', {
                        name: template.name,
                      })
                    : template.name,
                  value: template.id,
                }))}
                value={dialog.selectedTemplateId ?? ''}
              />

              <p className={styles.mailExampleNotice}>
                {t('addressReport.correction.mail.previewExample')}
              </p>

              {dialog.previewLoading ? (
                <SkeletonGroup label={t('addressReport.correction.mail.previewLoading')}>
                  <Skeleton height="12rem" variant="block" width="100%" />
                </SkeletonGroup>
              ) : null}

              {dialog.previewFailed ? (
                <p className={styles.mailWarning} role="alert">
                  {t('addressReport.correction.mail.previewUnavailable')}
                </p>
              ) : null}

              {dialog.preview === undefined || dialog.previewLoading ? null : (
                <>
                  <p className={styles.mailNotice}>
                    <strong>{t('addressReport.correction.mail.previewSubjectLabel')}</strong>{' '}
                    {dialog.preview.subject}
                  </p>
                  <iframe
                    className={styles.mailPreviewFrame}
                    sandbox=""
                    srcDoc={dialog.preview.html}
                    title={t('addressReport.correction.mail.previewFrameTitle')}
                  />
                </>
              )}
            </>
          )}
        </section>

        {dialog.errorCode === null ? null : (
          <p className={styles.mailWarning} role="alert">
            {t(addressCorrectionMailErrorMessageKey(dialog.errorCode))}{' '}
            {hasConfigurationShortcut ? (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => navigateToDeliveryClients(createBrowserWorkspaceNavigator())}
              >
                {t('addressReport.correction.mail.openMailSettingsLink')}
              </Button>
            ) : null}
          </p>
        )}

        {dialog.result === null ? null : (
          <p aria-live="polite" className={styles.mailResult}>
            {t('addressReport.correction.mail.sent', { count: dialog.result.recipientCount })}
          </p>
        )}

        <footer className={styles.mailFooter}>
          <Button onClick={dialog.close} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {isFinished
              ? t('addressReport.correction.mail.done')
              : t('addressReport.correction.mail.cancel')}
          </Button>
          {isFinished ? null : (
            <Button
              disabled={!dialog.canConfirm || dialog.isSending}
              onClick={dialog.confirm}
              size="sm"
              type="button"
            >
              <Icon name="send" />
              {dialog.isSending
                ? t('addressReport.correction.mail.sending')
                : t('addressReport.correction.mail.confirm')}
            </Button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
