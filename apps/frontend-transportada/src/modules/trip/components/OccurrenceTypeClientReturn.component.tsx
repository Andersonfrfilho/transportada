/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useClientChannelTemplateChoicesQuery } from '@/modules/occurrence-conversation/queries/occurrenceTypeMail.query'
import {
  CLIENT_RETURN_CHANNELS,
  CLIENT_RETURN_SEND_MODES,
  type ClientReturnChannel,
  type ClientReturnMatrix,
  type ClientReturnSendMode,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import {
  listClientReturnTemplates,
  resolveClientReturnProblem,
  resolveClientReturnSendNote,
  selectClientReturnSendMode,
  selectClientReturnTemplate,
  toggleClientReturnChannel,
} from '@/modules/trip/shared/occurrenceClientReturn.service'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

import { OccurrenceTypeClientReturnPreview } from './OccurrenceTypeClientReturnPreview.component'

const NO_TEMPLATE = ''

type OccurrenceTypeClientReturnProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 286 T4 (RF2): o bloco "Retorno ao cliente" do tipo — uma caixa por canal (e-mail, WhatsApp; SMS à vista, "em
 * breve"), cada um com o seu modelo do módulo de Notificações e o seu modo de envio. Grava na hora, um canal por vez; o
 * texto mora no módulo, o tipo só escolhe qual. Só existe com a API que já manda a matriz (`clientChannels`).
 */
export function OccurrenceTypeClientReturn({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeClientReturnProps) {
  const matrix = type.clientChannels
  if (matrix === undefined || matrix === null) return null
  return <ClientReturnFields disabled={disabled} matrix={matrix} onEdit={onEdit} />
}

type ClientReturnFieldsProps = Omit<OccurrenceTypeClientReturnProps, 'type'> &
  Readonly<{ matrix: ClientReturnMatrix }>

/** Separado para a lista de modelos só ser lida quando o tipo tem a matriz — API anterior não paga a consulta. */
function ClientReturnFields({ disabled, matrix, onEdit }: ClientReturnFieldsProps) {
  const { t } = useTranslation('companySettings')
  const templatesQuery = useClientChannelTemplateChoicesQuery({ enabled: true })
  const choices = templatesQuery.data

  function renderRow(channel: ClientReturnChannel) {
    const setting = matrix[channel]
    const options = [
      { label: t('occurrenceTypeCatalog.clientReturn.template.none'), value: NO_TEMPLATE },
      ...listClientReturnTemplates(choices ?? [], channel, setting.templateKey).map((choice) => ({
        ...(choice.subject === null ? {} : { description: choice.subject }),
        label: choice.key,
        value: choice.key,
      })),
      ...(setting.templateKey !== null &&
      !(choices ?? []).some(
        (choice) => choice.channel === channel && choice.key === setting.templateKey,
      ) &&
      templatesQuery.isSuccess
        ? [{ label: setting.templateKey, value: setting.templateKey }]
        : []),
    ]
    const selected = (choices ?? []).find(
      (choice) => choice.channel === channel && choice.key === setting.templateKey,
    )
    const problem = resolveClientReturnProblem({ channel, choices, setting })
    const channelLabel = t(`occurrenceTypeCatalog.clientReturn.channels.${channel}`)

    return (
      <li className={styles.channelRow} key={channel}>
        <div className={styles.channelBox}>
          <Checkbox
            checked={setting.enabled}
            disabled={disabled}
            label={channelLabel}
            onChange={(enabled) => onEdit(toggleClientReturnChannel(matrix, channel, enabled))}
          />
        </div>
        <div className={styles.channelFields}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {t('occurrenceTypeCatalog.clientReturn.template.label')}
            </span>
            <Select
              ariaLabel={`${channelLabel}: ${t('occurrenceTypeCatalog.clientReturn.template.label')}`}
              disabled={disabled || templatesQuery.isPending}
              onChange={(value) =>
                onEdit(
                  selectClientReturnTemplate(matrix, channel, value === NO_TEMPLATE ? null : value),
                )
              }
              options={options}
              value={setting.templateKey ?? NO_TEMPLATE}
            />
            <p className={styles.hint}>
              {channel === 'email' && selected?.subject !== undefined && selected.subject !== null
                ? t('occurrenceTypeCatalog.clientReturn.template.subject', {
                    subject: selected.subject,
                  })
                : t(`occurrenceTypeCatalog.clientReturn.template.hint.${channel}`)}
            </p>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              {t('occurrenceTypeCatalog.clientReturn.sendMode.label')}
            </span>
            <Select
              ariaLabel={`${channelLabel}: ${t('occurrenceTypeCatalog.clientReturn.sendMode.label')}`}
              disabled={disabled}
              onChange={(value) =>
                onEdit(selectClientReturnSendMode(matrix, channel, value as ClientReturnSendMode))
              }
              options={CLIENT_RETURN_SEND_MODES.map((mode) => ({
                label: t(`occurrenceTypeCatalog.clientReturn.sendMode.${mode}`),
                value: mode,
              }))}
              value={setting.sendMode}
            />
          </div>
        </div>
        {problem === null ? null : (
          <p className={styles.alert} role="alert">
            {problem.kind === 'unusable'
              ? t('occurrenceTypeCatalog.clientReturn.problem.unusable', {
                  channel: channelLabel,
                  problems: problem.codes
                    .map((code) => t(`occurrenceTypeCatalog.clientReturn.problem.codes.${code}`))
                    .join(' '),
                })
              : t(`occurrenceTypeCatalog.clientReturn.problem.${problem.kind}`, {
                  channel: channelLabel,
                })}
          </p>
        )}
        {resolveClientReturnSendNote(setting) === null ? null : (
          <p className={styles.hint}>
            {t('occurrenceTypeCatalog.clientReturn.sendNote.manual', { channel: channelLabel })}
          </p>
        )}
        {setting.enabled && selected !== undefined && selected.usable ? (
          <OccurrenceTypeClientReturnPreview choice={selected} />
        ) : null}
      </li>
    )
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.clientReturn.title')} className={styles.mail}>
      <p className={itemStyles.blockTitle}>
        <Icon name="send" size="sm" />
        {t('occurrenceTypeCatalog.clientReturn.title')}
      </p>
      <p className={styles.hint}>{t('occurrenceTypeCatalog.clientReturn.legend')}</p>
      {templatesQuery.isError ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.clientReturn.template.failed')}
        </p>
      ) : null}
      <ul className={styles.channelList}>
        {CLIENT_RETURN_CHANNELS.map((channel) => renderRow(channel))}
        <li className={styles.channelRow}>
          <div className={styles.channelBox}>
            <Checkbox
              checked={false}
              disabled
              label={t('occurrenceTypeCatalog.clientReturn.channels.sms')}
              onChange={() => undefined}
            />
          </div>
          <p className={styles.hint}>{t('occurrenceTypeCatalog.clientReturn.soon')}</p>
        </li>
      </ul>
    </section>
  )
}
