/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { getOccurrenceConversationClient } from '@/modules/occurrence-conversation/queries/occurrenceConversation.query'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { useResolveOccurrence } from '../queries/useResolveOccurrence.query'
import { useRecordDriverPayoutReceipt } from '../queries/useRecordDriverPayoutReceipt.query'
import { useSendDriverPayoutReceiptByWhatsApp } from '../queries/useSendDriverPayoutReceiptByWhatsApp.query'
import {
  isReceiptImageFileName,
  sendDriverPayoutReceipt,
  shouldConcludeAfterReceipt,
} from '../shared/driverPayoutReceipt.service'
import type {
  TripOccurrenceDetail,
  TripOccurrenceReceivingCharge,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

const FINANCIALS_PERMISSION = 'trip.financials'
const RESOLVE_PERMISSION = 'occurrences.resolve'
const MONEY = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

/**
 * Spec 317: a cobrança no recebimento no detalhe da ocorrência de parada — o que o motorista digitou no app (valor,
 * quem pagou, PIX) e as fotos das vagas (placa, extrato do pagamento). O PIX é dado financeiro: a API só o manda a quem
 * tem `trip.financials`; sem ele a tela diz que está restrito, nunca esconde em silêncio.
 */
export function OccurrenceReceivingCharge({
  occurrence,
  permissions = [],
}: Readonly<{
  occurrence: TripOccurrenceDetail
  permissions?: readonly string[]
}>): JSX.Element | null {
  const { t } = useTranslation('trip')
  const charge = occurrence.receivingCharge
  if (charge === undefined || charge === null) return null

  return (
    <section aria-labelledby="occurrence-receiving-charge-title" className={styles.receivingCharge}>
      <h3 id="occurrence-receiving-charge-title">{t('occurrenceDetail.receivingCharge.title')}</h3>
      <dl className={styles.occurrenceFacts}>
        {charge.declaredAmount === null ? null : (
          <div>
            <dt>{t('occurrenceDetail.receivingCharge.amount')}</dt>
            <dd>
              <strong>{MONEY.format(Number(charge.declaredAmount))}</strong>
            </dd>
          </div>
        )}
        {charge.paidBy === null ? null : (
          <div>
            <dt>{t('occurrenceDetail.receivingCharge.paidByLabel')}</dt>
            <dd>{t(`occurrenceDetail.receivingCharge.paidBy.${charge.paidBy}`)}</dd>
          </div>
        )}
        {charge.paidBy !== 'driver' ? null : (
          <div className={styles.occurrenceFactWide}>
            <dt>{t('occurrenceDetail.receivingCharge.pix')}</dt>
            <dd>
              {charge.driverPix === null ? (
                <span className={styles.occurrenceFactNote}>
                  {t('occurrenceDetail.receivingCharge.pixRestricted')}
                </span>
              ) : (
                <>
                  <span className={styles.receivingChargePix}>{charge.driverPix.key}</span>
                  <span className={styles.occurrenceFactNote}>
                    {t(`occurrenceDetail.receivingCharge.pixType.${charge.driverPix.type}`)}
                  </span>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      {charge.photos.length === 0 ? null : (
        <ul
          aria-label={t('occurrenceDetail.receivingCharge.photos')}
          className={styles.receivingChargePhotos}
        >
          {charge.photos.map((photo) => (
            <li key={photo.slotKey}>
              <a
                aria-label={t('occurrenceDetail.receivingCharge.openPhoto', { label: photo.label })}
                href={photo.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                <img alt={photo.label} loading="lazy" src={photo.url} />
              </a>
              <span>
                <Icon name="camera" size="sm" />
                {photo.label}
              </span>
            </li>
          ))}
        </ul>
      )}
      {charge.paidBy === 'driver' &&
      permissions.includes(FINANCIALS_PERMISSION) &&
      permissions.includes(RESOLVE_PERMISSION) ? (
        <DriverPayoutReceiptEntry
          charge={charge}
          occurrenceId={occurrence.id}
          resolutionState={occurrence.resolution?.state ?? null}
        />
      ) : null}
    </section>
  )
}

const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

/**
 * Spec 317 (E13): o escritório sobe o comprovante da transferência ao motorista, que vai a ele pelo chat da ocorrência
 * (a mesma subida e o mesmo envio da mensagem comum) e fica registrado na ocorrência. Só quem acompanha os valores
 * (`trip.financials`) e resolve ocorrências vê a ação; o comprovante já enviado aparece em miniatura e abre por link.
 * Enviar o comprovante (pelo chat ou pelo WhatsApp) conclui a ocorrência, se ela ainda estiver em aberto.
 */
function DriverPayoutReceiptEntry({
  charge,
  occurrenceId,
  resolutionState,
}: Readonly<{
  charge: TripOccurrenceReceivingCharge
  occurrenceId: string
  resolutionState: null | string
}>): JSX.Element {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const record = useRecordDriverPayoutReceipt()
  const whatsapp = useSendDriverPayoutReceiptByWhatsApp()
  const resolve = useResolveOccurrence()
  const [concludeFailed, setConcludeFailed] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const receipt = charge.driverPayoutReceipt ?? null

  /** O comprovante já foi enviado: concluir é o passo seguinte, e falhar nele não desfaz o envio. */
  async function concludeOccurrence(): Promise<void> {
    setConcludeFailed(false)
    if (!shouldConcludeAfterReceipt(resolutionState)) return
    try {
      await resolve.mutateAsync({
        kind: 'stop',
        note: t('occurrenceDetail.receivingCharge.payout.concludeNote'),
        occurrenceId,
      })
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code !== 'OCCURRENCE_ALREADY_RESOLVED') setConcludeFailed(true)
    }
  }

  async function handleSend(): Promise<void> {
    if (file === null) return
    setFailed(false)
    setIsSending(true)
    try {
      const attachmentId = await sendDriverPayoutReceipt({
        body: t('occurrenceResolution.receiptMessage'),
        client: getOccurrenceConversationClient(),
        file,
        idempotencyKey: crypto.randomUUID(),
        occurrenceId,
      })
      if (attachmentId === null) {
        setFailed(true)
        return
      }
      await record.mutateAsync({ attachmentId, occurrenceId })
      setFile(null)
      await concludeOccurrence()
    } catch {
      setFailed(true)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={styles.receivingChargePayout}>
      <h4>{t('occurrenceDetail.receivingCharge.payout.title')}</h4>
      {receipt === null ? null : (
        <p>
          <a href={receipt.url} rel="noreferrer noopener" target="_blank">
            {isReceiptImageFileName(receipt.fileName) ? (
              <img
                alt={t('occurrenceDetail.receivingCharge.payout.thumbnailAlt', {
                  fileName: receipt.fileName,
                })}
                className={styles.receivingChargePayoutThumbnail}
                loading="lazy"
                src={receipt.url}
              />
            ) : null}
            <Icon name="document" size="sm" />{' '}
            {t('occurrenceDetail.receivingCharge.payout.open', { fileName: receipt.fileName })}
          </a>
          <span className={styles.occurrenceFactNote}>
            {t('occurrenceDetail.receivingCharge.payout.sent', {
              moment: formatMoment(receipt.sentAt),
            })}
          </span>
        </p>
      )}
      {receipt === null ? null : (
        <div className={styles.receivingChargePayoutActions}>
          <Button
            disabled={whatsapp.isPending}
            onClick={() =>
              whatsapp.mutate({ occurrenceId }, { onSuccess: () => void concludeOccurrence() })
            }
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="message" />
            {t(
              whatsapp.isPending
                ? 'occurrenceDetail.receivingCharge.payout.whatsappSending'
                : 'occurrenceDetail.receivingCharge.payout.whatsapp',
            )}
          </Button>
          {whatsapp.isSuccess ? (
            <p className={styles.hint} role="status">
              {t('occurrenceDetail.receivingCharge.payout.whatsappSent')}
            </p>
          ) : null}
          {whatsapp.isError ? (
            <p className={styles.alert} role="alert">
              {t(`occurrenceDetail.receivingCharge.payout.${whatsappFailureKey(whatsapp.error)}`)}
            </p>
          ) : null}
        </div>
      )}
      <FileField
        accept={RECEIPT_ACCEPT}
        actionLabel={t('occurrenceDetail.receivingCharge.payout.choose')}
        disabled={isSending}
        {...(file === null ? {} : { fileName: file.name })}
        label={t('occurrenceDetail.receivingCharge.payout.label')}
        onSelect={(picked) => setFile(picked ?? null)}
        placeholder={t('occurrenceDetail.receivingCharge.payout.placeholder')}
      />
      <p className={styles.hint}>{t('occurrenceDetail.receivingCharge.payout.help')}</p>
      <Button
        disabled={file === null || isSending}
        onClick={() => void handleSend()}
        size="sm"
        type="button"
      >
        <Icon name="send" />
        {t(
          isSending
            ? 'occurrenceDetail.receivingCharge.payout.sending'
            : 'occurrenceDetail.receivingCharge.payout.send',
        )}
      </Button>
      {failed ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceDetail.receivingCharge.payout.failed')}
        </p>
      ) : null}
      {concludeFailed ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceDetail.receivingCharge.payout.concludeFailed')}
        </p>
      ) : null}
    </div>
  )
}

/** O código da API vira a mensagem; o motivo fechado do Evolution (`reason`) não chega ao cliente, então "falhou" cobre o resto. */
function whatsappFailureKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  if (code === 'DRIVER_WHATSAPP_PHONE_MISSING') return 'whatsappNoPhone'
  if (code === 'WHATSAPP_EVOLUTION_DISABLED' || code === 'WHATSAPP_EVOLUTION_NOT_CONFIGURED') {
    return 'whatsappDisconnected'
  }
  return 'whatsappFailed'
}
