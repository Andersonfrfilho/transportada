/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { NfseInvoiceRowActionsController } from '../hooks/useNfseInvoiceRowActions.hook'
import {
  describeNfseDeliveryFailure,
  hasPendingNfseDelivery,
} from '../shared/nfseInvoiceDelivery.service'
import { deriveIssRatePercent } from '../shared/nfseIssRate.service'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceDetailDialogProps = Readonly<{
  actions: NfseInvoiceRowActionsController
}>

const SKELETON_ROWS = 3
const EMPTY_VALUE = '—'

function formatMoment(value: null | string): string {
  if (value === null) return EMPTY_VALUE
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

export function NfseInvoiceDetailDialog({ actions }: NfseInvoiceDetailDialogProps) {
  const { t } = useTranslation('nfseInvoice')
  const isOpen = actions.detailTarget !== null
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: actions.closeDetail })

  if (actions.detailTarget === null) return null

  const detail = actions.detail
  /** Aberto pelo link da NF-e só o identificador chega: até o detalhe carregar não há nota nenhuma. */
  const invoice = detail ?? actions.detailTarget.invoice
  const delivery = detail?.delivery ?? null
  const failure = delivery === null ? null : describeNfseDeliveryFailure(delivery)
  const issRatePercent = invoice === null ? null : deriveIssRatePercent(invoice)
  const issChargeLabel =
    issRatePercent === null
      ? t('detail.issCharge')
      : t('detail.issChargeWithRate', { rate: issRatePercent })

  return createPortal(
    <div className={styles.emissionOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="nfse-detail-title"
        aria-modal="true"
        className={styles.emissionDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.emissionHeader}>
          <div>
            <h2 id="nfse-detail-title">{t('detail.title')}</h2>
            {invoice === null ? (
              <Skeleton variant="text" width="12rem" />
            ) : (
              <p className={styles.emissionHint}>{invoice.takerLegalName}</p>
            )}
          </div>
          <button
            aria-label={t('detail.close')}
            className={styles.iconAction}
            onClick={actions.closeDetail}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {actions.isDetailLoading ? (
          <SkeletonGroup className={styles.emissionSection} label={t('detail.loading')}>
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="90%" />
            <table className={styles.emissionTable}>
              <tbody>
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <tr key={index}>
                    <td>
                      <Skeleton variant="text" width="70%" />
                    </td>
                    <td>
                      <Skeleton variant="text" width="40%" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SkeletonGroup>
        ) : invoice === null ? (
          <section className={styles.emissionSection}>
            <p className={styles.placeholder} role="alert">
              {t('detail.unavailable')}
            </p>
          </section>
        ) : (
          <>
            <section className={styles.emissionSection}>
              <h3>{t('detail.summary')}</h3>
              <dl className={styles.detailList}>
                <div>
                  <dt>{t('field.serviceAmount')}</dt>
                  <dd>{formatAmount(invoice.serviceAmount)}</dd>
                </div>
                <div>
                  <dt>{t('field.issAmount')}</dt>
                  <dd>{formatAmount(invoice.issAmount)}</dd>
                </div>
                <div>
                  <dt>{t('field.status')}</dt>
                  <dd>{t(`status.${invoice.status}`)}</dd>
                </div>
                <div>
                  <dt>{t('field.providerNumber')}</dt>
                  <dd>{invoice.providerNumber ?? '—'}</dd>
                </div>
              </dl>
              {detail !== null && <p className={styles.emissionHint}>{detail.description}</p>}
            </section>

            {/* Não existe botão de transmitir: sem este bloco a nota parada fica sem explicação. */}
            {delivery !== null && (
              <section className={styles.emissionSection}>
                <h3>{t('delivery.title')}</h3>
                <dl className={styles.detailList}>
                  <div>
                    <dt>{t('delivery.situation')}</dt>
                    <dd>{t(`delivery.status.${delivery.status}`)}</dd>
                  </div>
                  <div>
                    <dt>{t('delivery.attempts')}</dt>
                    <dd>{delivery.attemptCount}</dd>
                  </div>
                  <div>
                    <dt>{t('delivery.next')}</dt>
                    <dd>
                      {hasPendingNfseDelivery(delivery)
                        ? formatMoment(delivery.nextAttemptAt)
                        : EMPTY_VALUE}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('delivery.updatedAt')}</dt>
                    <dd>{formatMoment(delivery.updatedAt)}</dd>
                  </div>
                </dl>
                {failure !== null && (
                  <p className={styles.placeholder} role="alert">
                    {t('delivery.failure')}:{' '}
                    {failure.kind === 'message'
                      ? failure.text
                      : t(`delivery.cause.${failure.cause}`, { defaultValue: failure.cause })}
                  </p>
                )}
                <p className={styles.emissionHint}>{t('delivery.hint')}</p>
              </section>
            )}

            {detail !== null && detail.charges.length > 0 && (
              <section className={styles.emissionSection}>
                <h3>{t('detail.charges')}</h3>
                <div className={styles.emissionTableWrap}>
                  <table className={styles.emissionTable}>
                    <thead>
                      <tr>
                        <th scope="col">{t('detail.chargeLabel')}</th>
                        <th className={styles.amountHeader} scope="col">
                          {t('detail.chargeBase')}
                        </th>
                        <th className={styles.amountHeader} scope="col">
                          {t('detail.chargeAmount')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.charges.map((charge) => (
                        <tr key={charge.ordinal}>
                          <td>{charge.label}</td>
                          <td className={styles.amountCell}>{formatAmount(charge.baseAmount)}</td>
                          <td className={styles.amountCell}>{formatAmount(charge.amount)}</td>
                        </tr>
                      ))}
                      {/* O ISS está dentro do valor do serviço, não somado a ele: por isso fica na lista, não no total. */}
                      <tr>
                        <td>{issChargeLabel}</td>
                        <td className={styles.amountCell}>{formatAmount(invoice.serviceAmount)}</td>
                        <td className={styles.amountCell}>{formatAmount(invoice.issAmount)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      {/* O total é o valor gravado na nota, não a soma da tela: é ele que foi emitido. */}
                      <tr>
                        <th colSpan={2} scope="row">
                          {t('detail.chargeTotal')}
                        </th>
                        <td className={styles.amountCell}>{formatAmount(invoice.serviceAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

            <section className={styles.emissionSection}>
              <h3>{t('detail.documents')}</h3>
              {actions.documents.length === 0 ? (
                <p className={styles.placeholder}>{t('detail.documentsEmpty')}</p>
              ) : (
                <div className={styles.emissionTableWrap}>
                  <table className={styles.emissionTable}>
                    <thead>
                      <tr>
                        <th scope="col">{t('detail.documentNumber')}</th>
                        <th scope="col">{t('detail.documentSeries')}</th>
                        <th className={styles.amountHeader} scope="col">
                          {t('detail.documentAmount')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions.documents.map((linked) => (
                        <tr key={linked.documentId}>
                          <td>{linked.number}</td>
                          <td>{linked.series}</td>
                          <td className={styles.amountCell}>{formatAmount(linked.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2} scope="row">
                          {t('detail.documentsTotal')}
                        </th>
                        <td className={styles.amountCell}>
                          {formatAmount(
                            sumScaledAmounts(actions.documents.map((linked) => linked.totalAmount)),
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>

            {detail !== null && detail.rejectionMessage !== null && (
              <section className={styles.emissionSection}>
                <h3>{t('detail.rejection')}</h3>
                <p className={styles.placeholder} role="alert">
                  {detail.rejectionCode ?? ''} {detail.rejectionMessage}
                </p>
              </section>
            )}

            {detail !== null && detail.cancellationReason !== null && (
              <section className={styles.emissionSection}>
                <h3>{t('detail.cancellation')}</h3>
                <p className={styles.emissionHint}>{detail.cancellationReason}</p>
              </section>
            )}
          </>
        )}

        <footer className={styles.emissionFooter}>
          <button className={styles.ghostAction} onClick={actions.closeDetail} type="button">
            <Icon name="close" />
            {t('detail.close')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
