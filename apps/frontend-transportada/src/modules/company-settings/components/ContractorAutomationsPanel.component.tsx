/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 285: as automações do fluxo semanal de um contratante — interruptor de ligar/desligar,
 * destinatários, tipo de XML (só CT-e emitido), prazo da fatura e tamanho das partes. Painel autocontido:
 * busca a própria configuração e só existe com `settings.manage`.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useContractorAutomationsQuery,
  useSaveContractorAutomationMutation,
} from '../hooks/useContractorAutomations.hook'
import {
  CONTRACTOR_AUTOMATION_FAILURE,
  ContractorAutomationRequestError,
  type ContractorAutomationFailure,
} from '../shared/contractorAutomationClient.service'
import {
  EMPTY_CONTRACTOR_AUTOMATION_FORM,
  toFormValues,
  toInput,
  type ContractorAutomation,
  type ContractorAutomationFormError,
  type ContractorAutomationFormValues,
} from '../shared/contractorAutomation.validation'
import styles from '../styles/businessCalendar.module.css'

export type ContractorAutomationsPanelProps = Readonly<{
  /** `settings.manage`: sem ela a seção não aparece e a consulta não sobe (a API recusaria). */
  canManage: boolean
}>

type Editing = Readonly<{ id: string | undefined; values: ContractorAutomationFormValues }>

function failureOf(error: unknown): ContractorAutomationFailure {
  return error instanceof ContractorAutomationRequestError
    ? error.failure
    : CONTRACTOR_AUTOMATION_FAILURE.FAILED
}

export function ContractorAutomationsPanel({ canManage }: ContractorAutomationsPanelProps) {
  const { t } = useTranslation('companySettings')
  const titleId = useId()
  const query = useContractorAutomationsQuery({ enabled: canManage })
  const mutation = useSaveContractorAutomationMutation()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [formError, setFormError] = useState<ContractorAutomationFormError | null>(null)

  if (!canManage) return null

  function startEditing(automation: ContractorAutomation | undefined): void {
    setFormError(null)
    mutation.reset()
    setEditing({
      id: automation?.id,
      values:
        automation === undefined ? EMPTY_CONTRACTOR_AUTOMATION_FORM : toFormValues(automation),
    })
  }

  function save(current: Editing): void {
    const parsed = toInput(current.values)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    setFormError(null)
    mutation.mutate(
      { ...(current.id === undefined ? {} : { id: current.id }), values: parsed.input },
      { onSuccess: () => setEditing(null) },
    )
  }

  /** O interruptor salva na hora: é o mesmo `PUT`, com o resto da automação como está. */
  function toggle(automation: ContractorAutomation, enabled: boolean): void {
    if (mutation.isPending) return
    mutation.mutate({
      id: automation.id,
      values: {
        billingDueDays: automation.billingDueDays,
        enabled,
        name: automation.name,
        nfseCity: automation.nfseCity,
        partSize: automation.partSize,
        recipients: automation.recipients,
        xmlKind: automation.xmlKind,
      },
    })
  }

  function change(patch: Partial<ContractorAutomationFormValues>): void {
    setEditing((current) =>
      current === null ? current : { ...current, values: { ...current.values, ...patch } },
    )
  }

  const automations = query.data

  return (
    <section aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id={titleId}>{t('automations.title')}</h2>
        <p className={styles.hint}>{t('automations.subtitle')}</p>
      </div>

      {query.isPending ? (
        <SkeletonGroup label={t('automations.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.block}>
          <p className={styles.hint} role="alert">
            {t(`automations.error.${failureOf(query.error)}`)}
          </p>
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('automations.retry')}
          </Button>
        </div>
      ) : null}

      {automations === undefined ? null : (
        <section className={styles.block}>
          {automations.length === 0 ? (
            <p className={styles.hint}>{t('automations.empty')}</p>
          ) : null}
          <ul className={styles.kindList}>
            {automations.map((automation) => (
              <li className={styles.kindRow} key={automation.id}>
                <div>
                  <strong>{automation.name}</strong>
                  <p className={styles.hint}>
                    {t('automations.summary', {
                      count: automation.recipients.length,
                      days: automation.billingDueDays,
                    })}
                  </p>
                </div>
                <Checkbox
                  checked={automation.enabled}
                  label={t(automation.enabled ? 'automations.on' : 'automations.off')}
                  onChange={(enabled) => toggle(automation, enabled)}
                />
                <Button
                  onClick={() => startEditing(automation)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="edit" />
                  {t('automations.edit')}
                </Button>
              </li>
            ))}
          </ul>
          {editing === null ? (
            <Button onClick={() => startEditing(undefined)} type="button">
              {t('automations.new')}
            </Button>
          ) : null}
        </section>
      )}

      {editing === null ? null : (
        <section className={styles.block}>
          <h3>{editing.id === undefined ? t('automations.new') : t('automations.editing')}</h3>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="automation-name">
                {t('automations.name')}
              </label>
              <input
                aria-invalid={formError === 'name'}
                className={styles.input}
                id="automation-name"
                maxLength={120}
                onChange={(event) => change({ name: event.target.value })}
                value={editing.values.name}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="automation-recipients">
                {t('automations.recipients')}
              </label>
              <textarea
                aria-invalid={formError === 'recipientFormat' || formError === 'recipientLimit'}
                className={styles.input}
                id="automation-recipients"
                onChange={(event) => change({ recipients: event.target.value })}
                rows={5}
                value={editing.values.recipients}
              />
              <p className={styles.hint}>{t('automations.recipientsHint')}</p>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="automation-due">
                {t('automations.dueDays')}
              </label>
              <input
                aria-invalid={formError === 'billingDueDays'}
                className={styles.input}
                id="automation-due"
                inputMode="numeric"
                onChange={(event) => change({ billingDueDays: event.target.value })}
                value={editing.values.billingDueDays}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="automation-part">
                {t('automations.partSize')}
              </label>
              <input
                aria-invalid={formError === 'partSize'}
                className={styles.input}
                id="automation-part"
                inputMode="numeric"
                onChange={(event) => change({ partSize: event.target.value })}
                value={editing.values.partSize}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="automation-city">
                {t('automations.nfseCity')}
              </label>
              <input
                className={styles.input}
                id="automation-city"
                onChange={(event) => change({ nfseCity: event.target.value })}
                value={editing.values.nfseCity}
              />
            </div>
            <p className={styles.hint}>{t('automations.xmlKind')}</p>
            <Checkbox
              checked={editing.values.enabled}
              label={t('automations.enabled')}
              onChange={(enabled) => change({ enabled })}
            />
            {formError === null ? null : (
              <p className={styles.hint} role="alert">
                {t(`automations.formError.${formError}`)}
              </p>
            )}
            <div className={styles.actions}>
              <Button disabled={mutation.isPending} onClick={() => save(editing)} type="button">
                <Icon name="save" />
                {mutation.isPending ? t('automations.saving') : t('automations.save')}
              </Button>
              <Button onClick={() => setEditing(null)} type="button" variant="ghost">
                {t('automations.cancel')}
              </Button>
            </div>
          </div>
        </section>
      )}

      {mutation.isError ? (
        <p className={styles.hint} role="alert">
          {t(`automations.error.${failureOf(mutation.error)}`)}
        </p>
      ) : null}
    </section>
  )
}
