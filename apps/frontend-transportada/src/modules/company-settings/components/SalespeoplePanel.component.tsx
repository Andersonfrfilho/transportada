/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 316 T1.4: o cadastro dos vendedores da contratante. Um vendedor pode atender várias contratantes e, em cada
 * uma, uma carteira de clientes própria. Só o escritório cadastra (`settings.manage`); painel autocontido, busca os
 * próprios dados.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useLinkContractorMutation,
  usePortfolioQuery,
  useReplacePortfolioMutation,
  useSalespeopleQuery,
  useSalespersonContractorsQuery,
  useSaveSalespersonMutation,
} from '../hooks/useSalespeople.hook'
import {
  SALESPERSON_FAILURE,
  SalespersonRequestError,
  type SalespersonFailure,
} from '../shared/salespersonClient.service'
import {
  EMPTY_SALESPERSON_FORM,
  parseTaxIds,
  toFormValues,
  toInput,
  type Salesperson,
  type SalespersonFormError,
  type SalespersonFormValues,
  type SalespersonStatus,
} from '../shared/salesperson.validation'
import styles from '../styles/businessCalendar.module.css'

export type SalespeoplePanelProps = Readonly<{
  /** `settings.manage`: sem ela a seção não aparece e a consulta não sobe (a API recusaria). */
  canManage: boolean
}>

type Editing = Readonly<{ id: string | undefined; values: SalespersonFormValues }>

function failureOf(error: unknown): SalespersonFailure {
  return error instanceof SalespersonRequestError ? error.failure : SALESPERSON_FAILURE.FAILED
}

export function SalespeoplePanel({ canManage }: SalespeoplePanelProps) {
  const { t } = useTranslation('companySettings')
  const titleId = useId()
  const query = useSalespeopleQuery({ enabled: canManage })
  const contractors = useSalespersonContractorsQuery({ enabled: canManage })
  const save = useSaveSalespersonMutation()
  const link = useLinkContractorMutation()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [formError, setFormError] = useState<SalespersonFormError | null>(null)
  const [portfolioOf, setPortfolioOf] = useState<Readonly<{
    contractorId: string
    id: string
  }> | null>(null)
  const [pickedContractor, setPickedContractor] = useState<Record<string, string>>({})

  if (!canManage) return null

  function startEditing(person: Salesperson | undefined): void {
    setFormError(null)
    save.reset()
    setEditing({
      id: person?.id,
      values: person === undefined ? EMPTY_SALESPERSON_FORM : toFormValues(person),
    })
  }

  function submit(current: Editing): void {
    const parsed = toInput(current.values)
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    setFormError(null)
    save.mutate(
      { ...(current.id === undefined ? {} : { id: current.id }), values: parsed.input },
      { onSuccess: () => setEditing(null) },
    )
  }

  function change(patch: Partial<SalespersonFormValues>): void {
    setEditing((current) =>
      current === null ? current : { ...current, values: { ...current.values, ...patch } },
    )
  }

  const people = query.data
  const mutationError = save.isError ? save.error : link.isError ? link.error : null

  return (
    <section aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id={titleId}>{t('salespeople.title')}</h2>
        <p className={styles.hint}>{t('salespeople.subtitle')}</p>
      </div>

      {query.isPending ? (
        <SkeletonGroup label={t('salespeople.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.block}>
          <p className={styles.hint} role="alert">
            {t(`salespeople.error.${failureOf(query.error)}`)}
          </p>
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('salespeople.retry')}
          </Button>
        </div>
      ) : null}

      {people === undefined ? null : (
        <section className={styles.block}>
          {people.length === 0 ? <p className={styles.hint}>{t('salespeople.empty')}</p> : null}
          <ul className={styles.kindList}>
            {people.map((person) => {
              const linkedIds = new Set(person.contractors.map((entry) => entry.contractorId))
              const options = (contractors.data ?? [])
                .filter((contractor) => !linkedIds.has(contractor.id))
                .map((contractor) => ({ label: contractor.displayName, value: contractor.id }))
              const picked = pickedContractor[person.id] ?? ''

              return (
                <li className={styles.kindRow} key={person.id}>
                  <div>
                    <strong>{person.name}</strong>
                    {person.status === 'inactive' ? (
                      <span className={styles.hint}> · {t('salespeople.inactive')}</span>
                    ) : null}
                    <p className={styles.hint}>
                      {[person.email, person.whatsapp]
                        .filter((value): value is string => value !== null)
                        .join(' · ')}
                    </p>
                    <ul className={styles.kindList}>
                      {person.contractors.map((entry) => (
                        <li className={styles.kindRow} key={entry.contractorId}>
                          <span>
                            {entry.contractorName}
                            <span className={styles.hint}>
                              {' · '}
                              {t('salespeople.clientCount', { count: entry.clientCount })}
                            </span>
                          </span>
                          <Button
                            onClick={() =>
                              setPortfolioOf({ contractorId: entry.contractorId, id: person.id })
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Icon name="edit" />
                            {t('salespeople.portfolio')}
                          </Button>
                          <Button
                            disabled={link.isPending}
                            onClick={() =>
                              link.mutate({
                                contractorId: entry.contractorId,
                                id: person.id,
                                linked: false,
                              })
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            {t('salespeople.unlink')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {options.length === 0 ? null : (
                      <div className={styles.actions}>
                        <Select
                          ariaLabel={t('salespeople.linkContractor')}
                          onChange={(value) =>
                            setPickedContractor((current) => ({ ...current, [person.id]: value }))
                          }
                          options={options}
                          placeholder={t('salespeople.linkContractor')}
                          value={picked}
                        />
                        <Button
                          disabled={picked === '' || link.isPending}
                          onClick={() => {
                            link.mutate(
                              { contractorId: picked, id: person.id, linked: true },
                              {
                                onSuccess: () =>
                                  setPickedContractor((current) => ({
                                    ...current,
                                    [person.id]: '',
                                  })),
                              },
                            )
                          }}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          {t('salespeople.link')}
                        </Button>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => startEditing(person)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="edit" />
                    {t('salespeople.edit')}
                  </Button>
                </li>
              )
            })}
          </ul>
          {editing === null ? (
            <Button onClick={() => startEditing(undefined)} type="button">
              {t('salespeople.new')}
            </Button>
          ) : null}
        </section>
      )}

      {editing === null ? null : (
        <section className={styles.block}>
          <h3>{editing.id === undefined ? t('salespeople.new') : t('salespeople.editing')}</h3>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="salesperson-name">
                {t('salespeople.name')}
              </label>
              <input
                aria-invalid={formError === 'name'}
                className={styles.input}
                id="salesperson-name"
                maxLength={120}
                onChange={(event) => change({ name: event.target.value })}
                value={editing.values.name}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="salesperson-email">
                {t('salespeople.email')}
              </label>
              <input
                aria-invalid={formError === 'emailFormat' || formError === 'contactRequired'}
                autoComplete="off"
                className={styles.input}
                id="salesperson-email"
                inputMode="email"
                onChange={(event) => change({ email: event.target.value })}
                value={editing.values.email}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="salesperson-whatsapp">
                {t('salespeople.whatsapp')}
              </label>
              <input
                aria-invalid={formError === 'contactRequired'}
                autoComplete="off"
                className={styles.input}
                id="salesperson-whatsapp"
                inputMode="tel"
                onChange={(event) => change({ whatsapp: event.target.value })}
                value={editing.values.whatsapp}
              />
              <p className={styles.hint}>{t('salespeople.contactHint')}</p>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('salespeople.status')}</span>
              <Select
                ariaLabel={t('salespeople.status')}
                onChange={(value) => change({ status: value as SalespersonStatus })}
                options={(['active', 'inactive'] as const).map((status) => ({
                  label: t(`salespeople.statusValue.${status}`),
                  value: status,
                }))}
                value={editing.values.status}
              />
            </div>
            {formError === null ? null : (
              <p className={styles.hint} role="alert">
                {t(`salespeople.formError.${formError}`)}
              </p>
            )}
            <div className={styles.actions}>
              <Button disabled={save.isPending} onClick={() => submit(editing)} type="button">
                <Icon name="save" />
                {save.isPending ? t('salespeople.saving') : t('salespeople.save')}
              </Button>
              <Button onClick={() => setEditing(null)} type="button" variant="ghost">
                {t('salespeople.cancel')}
              </Button>
            </div>
          </div>
        </section>
      )}

      {portfolioOf === null ? null : (
        <PortfolioEditor
          contractorId={portfolioOf.contractorId}
          id={portfolioOf.id}
          key={`${portfolioOf.id}:${portfolioOf.contractorId}`}
          onClose={() => setPortfolioOf(null)}
        />
      )}

      {mutationError === null ? null : (
        <p className={styles.hint} role="alert">
          {t(`salespeople.error.${failureOf(mutationError)}`)}
        </p>
      )}
    </section>
  )
}

type PortfolioEditorProps = Readonly<{ contractorId: string; id: string; onClose: () => void }>

/** A carteira de uma contratante: um CNPJ por linha. Salvar substitui a lista inteira. */
function PortfolioEditor({ contractorId, id, onClose }: PortfolioEditorProps) {
  const { t } = useTranslation('companySettings')
  const portfolio = usePortfolioQuery({ contractorId, enabled: true, id })
  const replace = useReplacePortfolioMutation()
  const [text, setText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<readonly string[]>([])

  const current = text ?? (portfolio.data ?? []).map((client) => client.taxId).join('\n')

  function submit(): void {
    const parsed = parseTaxIds(current)
    setInvalid(parsed.invalid)
    if (parsed.invalid.length > 0) return
    replace.mutate({ contractorId, id, taxIds: parsed.valid }, { onSuccess: onClose })
  }

  return (
    <section className={styles.block}>
      <h3>{t('salespeople.portfolioTitle')}</h3>
      {portfolio.isPending ? (
        <SkeletonGroup label={t('salespeople.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {portfolio.isError ? (
        <p className={styles.hint} role="alert">
          {t(`salespeople.error.${failureOf(portfolio.error)}`)}
        </p>
      ) : null}
      {portfolio.data === undefined ? null : (
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="salesperson-portfolio">
              {t('salespeople.portfolioLabel')}
            </label>
            <textarea
              aria-invalid={invalid.length > 0}
              className={styles.input}
              id="salesperson-portfolio"
              onChange={(event) => setText(event.target.value)}
              rows={8}
              value={current}
            />
            <p className={styles.hint}>{t('salespeople.portfolioHint')}</p>
          </div>
          {invalid.length === 0 ? null : (
            <p className={styles.hint} role="alert">
              {t('salespeople.portfolioInvalid', { list: invalid.join(', ') })}
            </p>
          )}
          {replace.isError ? (
            <p className={styles.hint} role="alert">
              {t(`salespeople.error.${failureOf(replace.error)}`)}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button disabled={replace.isPending} onClick={submit} type="button">
              <Icon name="save" />
              {replace.isPending ? t('salespeople.saving') : t('salespeople.save')}
            </Button>
            <Button onClick={onClose} type="button" variant="ghost">
              {t('salespeople.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
