/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { NOTIFICATION_SETTINGS_HREF } from '@/modules/notification/shared/notificationCatalog.constant'
import { useContractorMailTemplateChoicesQuery } from '@/modules/occurrence-conversation/queries/occurrenceTypeMail.query'
import {
  isHtmlMailBody,
  OCCURRENCE_MAIL_VARIABLE_NAMES,
  renderContractorMailPreview,
} from '@/modules/occurrence-conversation/shared/occurrenceTypeMailTemplate.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

const NO_TEMPLATE = ''

type OccurrenceTypeContractorTemplateSelectProps = Readonly<{
  disabled: boolean
  /** O tipo avisa a contratante e não há modelo utilizável: o e-mail não sai. */
  shouldWarnMissing: boolean
  onSelect: (templateKey: null | string) => void
  selectedKey: null | string
}>

function openNotificationSettings() {
  const navigator = createBrowserWorkspaceNavigator()
  navigator.pushPath(NOTIFICATION_SETTINGS_HREF)
  navigator.rememberWorkspace('notification')
  navigator.dispatchPopState()
}

/**
 * Spec 271 RF2/RF3/RF4: o texto do e-mail à contratante é um modelo de e-mail do módulo de notificação, criado só lá.
 * O tipo escolhe **qual**, pela chave: lista os utilizáveis (sem os avisos do sistema, HTML ou variável fora da lista),
 * mostra a prévia com valores de exemplo, as variáveis e o modelo sugerido para copiar.
 */
export function OccurrenceTypeContractorTemplateSelect({
  disabled,
  onSelect,
  selectedKey,
  shouldWarnMissing,
}: OccurrenceTypeContractorTemplateSelectProps) {
  const { t } = useTranslation('companySettings')
  const templatesQuery = useContractorMailTemplateChoicesQuery({ enabled: true })

  const templates = templatesQuery.data ?? []
  const selected = templates.find((template) => template.key === selectedKey)
  const preview = selected === undefined ? null : renderContractorMailPreview(selected)
  const unusableProblems =
    selected !== undefined && !selected.usable
      ? selected.problems.map((problem) =>
          problem.variables === undefined
            ? t(`occurrenceTypeCatalog.mail.template.problems.${problem.code}`)
            : t(`occurrenceTypeCatalog.mail.template.problems.${problem.code}`, {
                variables: problem.variables.join(', '),
              }),
        )
      : []
  const options = [
    { label: t('occurrenceTypeCatalog.mail.template.none'), value: NO_TEMPLATE },
    ...(selectedKey !== null && selected === undefined && templatesQuery.isSuccess
      ? [{ label: selectedKey, value: selectedKey }]
      : []),
    ...templates
      .filter((template) => template.usable || template.key === selectedKey)
      .map((template) => ({
        description: template.subject,
        label: template.key,
        value: template.key,
      })),
  ]

  function renderStatus() {
    if (templatesQuery.isError) return t('occurrenceTypeCatalog.mail.template.failed')
    if (templatesQuery.isPending) return t('occurrenceTypeCatalog.mail.template.loading')
    return null
  }

  const status = renderStatus()

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('occurrenceTypeCatalog.mail.template.label')}</span>
        <Select
          ariaLabel={t('occurrenceTypeCatalog.mail.template.label')}
          disabled={disabled || templatesQuery.isPending}
          onChange={(value) => onSelect(value === NO_TEMPLATE ? null : value)}
          options={options}
          value={selectedKey ?? NO_TEMPLATE}
        />
      </div>
      {shouldWarnMissing ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.mail.template.missing')}
        </p>
      ) : null}
      {unusableProblems.length === 0 ? null : (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.mail.template.unusable', {
            key: selectedKey,
            problems: unusableProblems.join(' '),
          })}
        </p>
      )}
      {preview === null ? null : (
        <aside
          aria-label={t('occurrenceTypeCatalog.mail.template.previewTitle')}
          className={styles.preview}
        >
          <p className={styles.fieldLabel}>
            {t('occurrenceTypeCatalog.mail.template.previewTitle')}
          </p>
          <div className={styles.mailCard}>
            <p className={styles.mailSubject}>{preview.subject}</p>
            {isHtmlMailBody(preview.body) ? (
              /* Sandbox vazio: sem script, sem formulário, sem navegação — a prévia é só desenho. */
              <iframe
                className={styles.mailFrame}
                sandbox=""
                srcDoc={preview.body}
                title={t('occurrenceTypeCatalog.mail.template.previewTitle')}
              />
            ) : (
              <pre className={styles.mailBody}>{preview.body}</pre>
            )}
          </div>
        </aside>
      )}
      {status === null ? null : (
        <p aria-live="polite" className={styles.hint} role="status">
          {status}
        </p>
      )}
      <p className={styles.hint}>{t('occurrenceTypeCatalog.mail.template.hint')}</p>
      <details className={styles.field}>
        <summary>{t('occurrenceTypeCatalog.mail.template.variablesTitle')}</summary>
        <ul>
          {OCCURRENCE_MAIL_VARIABLE_NAMES.map((name) => (
            <li key={name}>
              <code>{`{{${name}}}`}</code> —{' '}
              {t(`occurrenceTypeCatalog.mail.template.variables.${name}`)}
            </li>
          ))}
        </ul>
      </details>
      <div className={styles.actions}>
        <Button
          className={styles.action}
          onClick={openNotificationSettings}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="edit" />
          {t('occurrenceTypeCatalog.mail.template.createInNotifications')}
        </Button>
      </div>
    </div>
  )
}
