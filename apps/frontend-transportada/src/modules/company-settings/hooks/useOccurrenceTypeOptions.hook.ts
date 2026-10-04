/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_REDELIVERY_POLICY,
  OCCURRENCE_TYPE_FLOWS,
} from '@/modules/trip/shared/occurrence.constant'

type SelectOption = Readonly<{ label: string; value: string }>

type OccurrenceTypeOptions = Readonly<{
  attachmentModeOptions: readonly SelectOption[]
  flowOptions: readonly SelectOption[]
  redeliveryPolicyOptions: readonly SelectOption[]
}>

export function useOccurrenceTypeOptions(): OccurrenceTypeOptions {
  const { t } = useTranslation('companySettings')

  return {
    attachmentModeOptions: [
      { label: t('occurrenceTypeCatalog.attachmentModeOff'), value: 'off' },
      { label: t('occurrenceTypeCatalog.attachmentModeOptional'), value: 'optional' },
      { label: t('occurrenceTypeCatalog.attachmentModeRequired'), value: 'required' },
    ],
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
