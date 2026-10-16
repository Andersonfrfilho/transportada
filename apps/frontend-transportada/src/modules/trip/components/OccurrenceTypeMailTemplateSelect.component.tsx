/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useContractorMailTemplates } from '@/modules/delivery-clients/hooks/useContractorMailTemplates.hook'
import { getContractorMailTemplatesClient } from '@/modules/delivery-clients/shared/contractorMailTemplatesClient.service'
import {
  createBrowserWorkspaceNavigator,
  navigateToDeliveryClients,
} from '@/modules/nfe-workspace/shared/deliveryClientsNavigation.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

const NO_TEMPLATE = ''
const PREVIEW_QUERY_KEY = 'occurrence-mail-template-preview'

type OccurrenceTypeMailTemplateSelectProps = Readonly<{
  disabled: boolean
  /** O tipo pergunta "Nenhum"; a exceção da contratante pergunta "Herdar do tipo" (nulo nos dois). */
  isInheriting?: boolean
  onSelect: (templateId: null | string) => void
  selectedTemplateId: null | string
  /** O tipo avisa a contratante e não há modelo efetivo: o e-mail não sai. */
  shouldWarnMissing: boolean
}>

/**
 * Spec 269 RF1: o e-mail à contratante sai de um modelo `occurrence` do cadastro de modelos — o tipo (ou a
 * exceção da contratante) só escolhe qual. A prévia é a do servidor, com dados de exemplo.
 */
export function OccurrenceTypeMailTemplateSelect({
  disabled,
  isInheriting = false,
  onSelect,
  selectedTemplateId,
  shouldWarnMissing,
}: OccurrenceTypeMailTemplateSelectProps) {
  const { t } = useTranslation('companySettings')
  const { templatesQuery } = useContractorMailTemplates({ enabled: true, mailType: 'occurrence' })
  const previewQuery = useQuery({
    enabled: selectedTemplateId !== null,
    queryFn: () =>
      getContractorMailTemplatesClient().preview({ templateId: selectedTemplateId as string }),
    queryKey: [PREVIEW_QUERY_KEY, selectedTemplateId],
  })

  const templates = templatesQuery.data ?? []
  const options = [
    {
      label: t(
        isInheriting
          ? 'occurrenceTypeCatalog.mailTemplate.inherit'
          : 'occurrenceTypeCatalog.mailTemplate.none',
      ),
      value: NO_TEMPLATE,
    },
    ...templates
      .filter((template) => template.status === 'active' || template.id === selectedTemplateId)
      .map((template) => ({
        label:
          template.status === 'active'
            ? template.name
            : t('occurrenceTypeCatalog.mailTemplate.archivedName', { name: template.name }),
        value: template.id,
      })),
  ]

  function renderStatus() {
    if (templatesQuery.isError) return t('occurrenceTypeCatalog.mailTemplate.failed')
    if (selectedTemplateId === null) return null
    if (previewQuery.isError) return t('occurrenceTypeCatalog.mailTemplate.previewFailed')
    if (previewQuery.isPending) return t('occurrenceTypeCatalog.mailTemplate.previewLoading')
    return null
  }

  const status = renderStatus()

  return (
    <div className={styles.fields}>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('occurrenceTypeCatalog.mailTemplate.label')}</span>
        <Select
          ariaLabel={t('occurrenceTypeCatalog.mailTemplate.label')}
          disabled={disabled || templatesQuery.isPending}
          onChange={(value) => onSelect(value === NO_TEMPLATE ? null : value)}
          options={options}
          value={selectedTemplateId ?? NO_TEMPLATE}
        />
      </div>
      {shouldWarnMissing ? (
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.mailTemplate.missing')}
        </p>
      ) : null}
      {previewQuery.data === undefined ? null : (
        <aside
          aria-label={t('occurrenceTypeCatalog.mailTemplate.previewTitle')}
          className={styles.preview}
        >
          <p className={styles.fieldLabel}>
            {t('occurrenceTypeCatalog.mailTemplate.previewTitle')}
          </p>
          <div className={styles.mailCard}>
            <p className={styles.mailSubject}>{previewQuery.data.subject}</p>
            <pre className={styles.mailBody}>{previewQuery.data.text}</pre>
          </div>
        </aside>
      )}
      {status === null ? null : (
        <p aria-live="polite" className={styles.hint} role="status">
          {status}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          className={styles.action}
          onClick={() => navigateToDeliveryClients(createBrowserWorkspaceNavigator())}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="edit" />
          {t('occurrenceTypeCatalog.mailTemplate.manage')}
        </Button>
      </div>
    </div>
  )
}
