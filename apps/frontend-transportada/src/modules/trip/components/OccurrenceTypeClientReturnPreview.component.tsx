/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { renderTemplate, PREVIEW_VIEWPORT_BY_CHANNEL } from '@adatechnology/notification-contracts'
import { TemplatePreview, type PreviewLabels } from '@adatechnology/notification-ui'
import { useNotificationContext } from '@adatechnology/notification-ui/headless'
import { useTranslation } from 'react-i18next'

import { useInstallationBrand } from '@/modules/identity/queries/useInstallationBrand.query'
import { NOTIFICATION_PRODUCT_NAME } from '@/modules/notification/shared/notificationCatalog.constant'
import type { ClientChannelTemplateChoice } from '@/modules/occurrence-conversation/shared/occurrenceTypeMail.types'
import { OCCURRENCE_MAIL_SAMPLE_VALUES } from '@/modules/occurrence-conversation/shared/occurrenceTypeMailTemplate.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeClientReturnPreviewProps = Readonly<{
  choice: ClientChannelTemplateChoice
}>

const PREVIEW_LABEL_KEYS = [
  'to',
  'now',
  'mailbox',
  'time',
  'address',
  'counter',
  'folder',
  'senderAddress',
  'unsubscribe',
  'online',
  'today',
  'compose',
  'reply',
  'forward',
  'replyAll',
] as const

/**
 * Spec 286 T4 (RF1b): a prévia do modelo é a do SDK de Notificações (`TemplatePreview`, a mesma moldura da tela de
 * Preferências), nunca uma desenhada aqui. O texto sai do `renderTemplate` do pacote de contratos — o mesmo que o envio
 * usa — com valores de exemplo; o boleto aparece como o anexo que segue com a mensagem.
 */
export function OccurrenceTypeClientReturnPreview({
  choice,
}: OccurrenceTypeClientReturnPreviewProps) {
  const { t } = useTranslation('companySettings')
  const { messages, theme } = useNotificationContext()
  const installationBrand = useInstallationBrand()
  const senderName = installationBrand.data?.name ?? NOTIFICATION_PRODUCT_NAME
  const labelOf = (key: string): string =>
    (messages as Readonly<Record<string, string>>)[key] ?? key
  const labels = Object.fromEntries(
    PREVIEW_LABEL_KEYS.map((name) => [name, labelOf(`preview.${name}`)]),
  ) as PreviewLabels
  const rendered = renderTemplate({
    body: choice.body,
    channel: choice.channel,
    payload: OCCURRENCE_MAIL_SAMPLE_VALUES,
    ...(choice.subject === null ? {} : { subject: choice.subject }),
  })
  const viewport = PREVIEW_VIEWPORT_BY_CHANNEL[choice.channel][0]
  if (viewport === undefined) return null

  return (
    <details className={styles.field}>
      <summary>{t('occurrenceTypeCatalog.clientReturn.previewTitle')}</summary>
      <div className={`${theme.rootClassName ?? ''} ${styles.sdkPreview ?? ''}`}>
        <TemplatePreview
          attachment={{
            detail: t('occurrenceTypeCatalog.clientReturn.attachmentDetail'),
            name: t('occurrenceTypeCatalog.clientReturn.attachmentName'),
          }}
          channel={choice.channel}
          labels={labels}
          rendered={rendered}
          senderName={senderName}
          viewport={viewport.viewport}
          {...(choice.channel === 'email' && rendered.html !== undefined
            ? { emailHtml: rendered.html }
            : {})}
        />
      </div>
    </details>
  )
}
