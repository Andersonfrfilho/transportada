/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T2.3: o cadastro das categorias de contas da empresa (aluguel, seguro, combustível…). Painel autocontido:
 * busca os próprios dados pelo módulo `expenses`. Lê com `expenses.read`; cadastra e desativa com `expenses.manage`.
 * Categoria se desativa, nunca se apaga — a conta antiga continua mostrando o nome dela.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useExpenseCategories,
  useExpenseMutations,
} from '@/modules/expenses/hooks/useExpenses.hook'
import styles from '../styles/businessCalendar.module.css'

export type ExpenseCategoriesPanelProps = Readonly<{
  /** `expenses.manage`: sem ela a lista aparece, mas sem formulário nem botão de desativar. */
  canManage: boolean
  /** `expenses.read`: sem ela a consulta não sobe (a API recusaria). */
  canRead: boolean
}>

const KNOWN_ERRORS = ['EXPENSE_CATEGORY_NAME_TAKEN', 'REQUEST_FAILED'] as const

/** Código desconhecido cai na frase genérica: a tela nunca mostra o código cru. */
export function expenseCategoryErrorKey(error: unknown): (typeof KNOWN_ERRORS)[number] {
  const code = error instanceof Error ? error.message : ''
  return KNOWN_ERRORS.find((known) => known === code) ?? 'REQUEST_FAILED'
}

export function ExpenseCategoriesPanel({ canManage, canRead }: ExpenseCategoriesPanelProps) {
  const { t } = useTranslation('companySettings')
  const titleId = useId()
  const nameId = useId()
  const query = useExpenseCategories({ enabled: canRead })
  const { createCategory, setCategoryActive } = useExpenseMutations()
  const [name, setName] = useState('')

  if (!canRead) return null

  function submit(): void {
    const trimmed = name.trim()
    if (trimmed === '') return
    createCategory.mutate(trimmed, { onSuccess: () => setName('') })
  }

  const categories = query.data
  const mutationError = createCategory.isError
    ? createCategory.error
    : setCategoryActive.isError
      ? setCategoryActive.error
      : null

  return (
    <section aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id={titleId}>{t('expenseCategories.title')}</h2>
        <p className={styles.hint}>{t('expenseCategories.subtitle')}</p>
      </div>

      {query.isPending ? (
        <SkeletonGroup label={t('expenseCategories.loading')}>
          <Skeleton height="2rem" width="60%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <div className={styles.block}>
          <p className={styles.hint} role="alert">
            {t('expenseCategories.error.REQUEST_FAILED')}
          </p>
          <Button onClick={() => void query.refetch()} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('expenseCategories.retry')}
          </Button>
        </div>
      ) : null}

      {categories === undefined ? null : (
        <section className={styles.block}>
          {categories.length === 0 ? (
            <p className={styles.hint}>{t('expenseCategories.empty')}</p>
          ) : (
            <ul className={styles.kindList}>
              {categories.map((category) => (
                <li className={styles.kindRow} key={category.id}>
                  <span>
                    {category.name}
                    {category.requiresDriver ? (
                      <span className={styles.hint}>
                        {' '}
                        · {t('expenseCategories.requiresDriver')}
                      </span>
                    ) : null}
                    {category.active ? null : (
                      <span className={styles.hint}> · {t('expenseCategories.inactive')}</span>
                    )}
                  </span>
                  {canManage ? (
                    <Button
                      disabled={setCategoryActive.isPending}
                      onClick={() =>
                        setCategoryActive.mutate({ active: !category.active, id: category.id })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {category.active ? <Icon name="trash" /> : <Icon name="refresh" />}
                      {category.active
                        ? t('expenseCategories.deactivate')
                        : t('expenseCategories.reactivate')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage ? (
        <section className={styles.block}>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor={nameId}>
                {t('expenseCategories.name')}
              </label>
              <input
                className={styles.input}
                id={nameId}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className={styles.actions}>
              <Button
                disabled={createCategory.isPending || name.trim() === ''}
                onClick={submit}
                type="button"
              >
                <Icon name="save" />
                {createCategory.isPending
                  ? t('expenseCategories.saving')
                  : t('expenseCategories.save')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {mutationError === null ? null : (
        <p className={styles.hint} role="alert">
          {t(`expenseCategories.error.${expenseCategoryErrorKey(mutationError)}`)}
        </p>
      )}
    </section>
  )
}
