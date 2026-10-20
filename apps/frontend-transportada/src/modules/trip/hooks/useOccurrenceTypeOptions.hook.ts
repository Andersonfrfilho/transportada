/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_REDELIVERY_POLICY,
  OCCURRENCE_TYPE_FLOWS,
} from '@/modules/trip/shared/occurrence.constant'
import { DUPLICATE_REQUEST_POLICIES } from '@/modules/trip/shared/occurrenceContractorReply.constant'

type SelectOption = Readonly<{ label: string; value: string }>

type OccurrenceTypeOptions = Readonly<{
  attachmentModeOptions: readonly SelectOption[]
  duplicateRequestPolicyOptions: readonly SelectOption[]
  flowOptions: readonly SelectOption[]
  redeliveryPolicyOptions: readonly SelectOption[]
}>

export function useOccurrenceTypeOptions(): OccurrenceTypeOptions {
  const { t } = useTranslation('companySettings')

  return {
    attachmentModeOptions: [
      {
        label: t('occurrenceTypeCatalog.attachmentModeOff'),
        value: OCCURRENCE_ATTACHMENT_MODE.off,
      },
      {
        label: t('occurrenceTypeCatalog.attachmentModeOptional'),
        value: OCCURRENCE_ATTACHMENT_MODE.optional,
      },
      {
        label: t('occurrenceTypeCatalog.attachmentModeRequired'),
        value: OCCURRENCE_ATTACHMENT_MODE.required,
      },
    ],
    duplicateRequestPolicyOptions: DUPLICATE_REQUEST_POLICIES.map((value) => ({
      label: t(`occurrenceTypeCatalog.duplicateRequestPolicyOptions.${value}`),
      value,
    })),
    flowOptions: OCCURRENCE_TYPE_FLOWS.map((value) => ({
      label: t(`occurrenceTypeCatalog.flow${value === 'document' ? 'Document' : 'Stop'}`),
      value,
    })),
    redeliveryPolicyOptions: [
      {
        label: t('occurrenceTypeCatalog.redeliveryPolicyUnset'),
        value: OCCURRENCE_REDELIVERY_POLICY.unset,
      },
      {
        label: t('occurrenceTypeCatalog.redeliveryPolicyAllowed'),
        value: OCCURRENCE_REDELIVERY_POLICY.allowed,
      },
      {
        label: t('occurrenceTypeCatalog.redeliveryPolicyBlocked'),
        value: OCCURRENCE_REDELIVERY_POLICY.blocked,
      },
    ],
  }
}
