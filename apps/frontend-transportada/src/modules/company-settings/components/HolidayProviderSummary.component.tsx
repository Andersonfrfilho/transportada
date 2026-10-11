/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatCount, formatInstantDate } from '../shared/holidayImportFormat.service'
import { HOLIDAY_PROVIDER_BUDGET_ORIGIN } from '../shared/holidayProviderSettings.constant'
import type { HolidayProviderSettings } from '../shared/holidayProviderSettings.types'
import styles from '../styles/holidayProviderSettings.module.css'

type HolidayProviderSummaryProps = Readonly<{
  /** `undefined` enquanto o status não chegou (ou falhou): a linha de uso do mês some em vez de inventar um número. */
  monthlyRequests: number | undefined
  settings: HolidayProviderSettings
}>

/**
 * O estado da configuração em três linhas: a chave (pela dica, nunca inteira), o orçamento mensal (com a marca "padrão"
 * quando ninguém o definiu) e quanto do mês já foi usado. O orçamento atingido é dito aqui, junto do número.
 */
export function HolidayProviderSummary({ monthlyRequests, settings }: HolidayProviderSummaryProps) {
  const { i18n, t } = useTranslation('businessCalendar')
  const language = i18n.language
  const budget = settings.monthlyRequestBudget
  const hasReachedBudget = monthlyRequests !== undefined && monthlyRequests >= budget
  const tokenText = settings.tokenConfigured
    ? t(
        settings.tokenUpdatedAt === null
          ? 'providerSettings.token.configuredNoDate'
          : 'providerSettings.token.configured',
        {
          date:
            settings.tokenUpdatedAt === null
              ? ''
              : formatInstantDate({ language, value: settings.tokenUpdatedAt }),
          hint: settings.tokenHint ?? '',
        },
      )
    : t('providerSettings.token.missing')

  return (
    <>
      <ul className={styles.summary}>
        <li data-fact="token" data-state={settings.tokenConfigured ? 'configured' : 'missing'}>
          {tokenText}
        </li>
        <li data-fact="budget">
          {t('providerSettings.budget.value', {
            count: budget,
            value: formatCount({ language, value: budget }),
          })}
          {settings.budgetOrigin === HOLIDAY_PROVIDER_BUDGET_ORIGIN.DEFAULT ? (
            <>
              {' '}
              <span className={styles.tag}>{t('providerSettings.budget.defaultTag')}</span>
            </>
          ) : null}
        </li>
        {monthlyRequests === undefined ? null : (
          <li data-fact="usage">
            {t('providerSettings.usage.line', {
              budget: formatCount({ language, value: budget }),
              used: formatCount({ language, value: monthlyRequests }),
            })}
          </li>
        )}
      </ul>
      {hasReachedBudget ? (
        <p className={styles.notice} data-notice="budget-reached">
          {t('providerSettings.usage.reached')}
        </p>
      ) : null}
      <p className={styles.notice} data-notice="routine-paused">
        {t('providerSettings.routine')}
      </p>
    </>
  )
}
