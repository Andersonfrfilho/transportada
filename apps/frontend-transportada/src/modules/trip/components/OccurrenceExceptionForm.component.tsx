/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select } from '@/components/ui/select'
import type { OccurrenceAttachmentMode } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceExceptionKey } from '@/modules/trip/shared/occurrenceException.service'
import {
  buildExceptionClientOptions,
  type OccurrenceExceptionPeople,
} from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import { OccurrenceExceptionModeSelect } from './OccurrenceExceptionModeSelect.component'

type OccurrenceExceptionFormProps = Readonly<{
  disabled: boolean
  onAdd: (
    input: Readonly<{ attachmentMode: OccurrenceAttachmentMode; key: OccurrenceExceptionKey }>,
  ) => void
  people: OccurrenceExceptionPeople
  typeAttachmentMode: OccurrenceAttachmentMode
  usedValues: readonly string[]
}>

/**
 * Spec 246 RF1f/T5.3c: o cliente da exceção é escolhido entre os cadastrados, por nome ou CNPJ — nunca
 * digitado. A foto nasce igual à do tipo (a exceção a declara); os outros quatro campos nascem herdando.
 */
export function OccurrenceExceptionForm({
  disabled,
  onAdd,
  people,
  typeAttachmentMode,
  usedValues,
}: OccurrenceExceptionFormProps) {
  const { t } = useTranslation('companySettings')
  const reasonId = useId()
  const hintId = useId()
  const [kind, setKind] = useState<OccurrenceExceptionKey['kind']>('recipient')
  const [clientValue, setClientValue] = useState('')
  const [attachmentMode, setAttachmentMode] = useState<null | OccurrenceAttachmentMode>(null)
  const status = kind === 'contractor' ? people.contractorsStatus : people.recipientsStatus
  const options = buildExceptionClientOptions({ kind, people, usedValues })
  const reasonKey = resolveReasonKey({ hasOptions: options.length > 0, kind, status })
  const isBlocked = reasonKey !== null
  const isAddDisabled = disabled || isBlocked || clientValue === ''
  const isTruncated =
    kind === 'contractor' ? people.contractorsTruncated : people.recipientsTruncated
  const needsClient = !disabled && !isBlocked && clientValue === ''

  function handleKindChange(next: string) {
    setKind(next === 'contractor' ? 'contractor' : 'recipient')
    setClientValue('')
  }

  function handleAdd() {
    if (isAddDisabled) return
    const key: OccurrenceExceptionKey =
      kind === 'contractor' ? { contractorId: clientValue, kind } : { kind, taxId: clientValue }
    onAdd({ attachmentMode: attachmentMode ?? typeAttachmentMode, key })
    setClientValue('')
    setAttachmentMode(null)
  }

  return (
    <div>
      <div
        aria-describedby={isBlocked ? reasonId : undefined}
        className={styles.addForm}
        role="group"
        aria-label={t('occurrenceTypeCatalog.exceptions.add')}
      >
        <div className={styles.field}>
          <span aria-hidden="true" className={styles.fieldLabel}>
            {t('occurrenceTypeCatalog.exceptions.kind')}
          </span>
          <Select
            ariaLabel={t('occurrenceTypeCatalog.exceptions.kind')}
            compact
            disabled={disabled}
            onChange={handleKindChange}
            options={[
              { label: t('occurrenceTypeCatalog.exceptions.kindRecipient'), value: 'recipient' },
              { label: t('occurrenceTypeCatalog.exceptions.kindContractor'), value: 'contractor' },
            ]}
            value={kind}
          />
        </div>
        <div className={styles.field}>
          <span aria-hidden="true" className={styles.fieldLabel}>
            {t('occurrenceTypeCatalog.exceptions.client')}
          </span>
          <SearchableSelect
            ariaLabel={t('occurrenceTypeCatalog.exceptions.client')}
            disabled={disabled || isBlocked}
            emptyLabel={t('occurrenceTypeCatalog.exceptions.clientEmpty')}
            onChange={setClientValue}
            options={options}
            placeholder={t('occurrenceTypeCatalog.exceptions.clientPlaceholder')}
            searchPlaceholder={t('occurrenceTypeCatalog.exceptions.clientSearch')}
            value={clientValue}
          />
        </div>
        <OccurrenceExceptionModeSelect
          canInherit={false}
          disabled={disabled}
          field="photo"
          onChange={(mode) => setAttachmentMode(mode)}
          value={attachmentMode ?? typeAttachmentMode}
        />
        <Button
          aria-describedby={needsClient ? hintId : undefined}
          disabled={isAddDisabled}
          onClick={handleAdd}
          size="sm"
          type="button"
        >
          <Icon name="add" />
          {t('occurrenceTypeCatalog.exceptions.add')}
        </Button>
      </div>
      {needsClient ? (
        <p className={styles.legend} id={hintId}>
          {t('occurrenceTypeCatalog.exceptions.pickClientFirst')}
        </p>
      ) : null}
      {isTruncated ? (
        <p className={styles.alert} role="status">
          {t(
            `occurrenceTypeCatalog.exceptions.${kind === 'contractor' ? 'contractorsTruncated' : 'clientsTruncated'}`,
          )}
        </p>
      ) : null}
      {reasonKey === null ? null : (
        <p className={styles.alert} id={reasonId} role="status">
          {t(`occurrenceTypeCatalog.exceptions.${reasonKey}`)}
        </p>
      )}
    </div>
  )
}

function resolveReasonKey(
  input: Readonly<{
    hasOptions: boolean
    kind: OccurrenceExceptionKey['kind']
    status: OccurrenceExceptionPeople['contractorsStatus']
  }>,
): null | string {
  if (input.status === 'error') {
    return input.kind === 'contractor' ? 'contractorsFailed' : 'clientsFailed'
  }
  if (input.status === 'loading') return 'clientsLoading'
  return input.hasOptions ? null : 'allClientsUsed'
}
