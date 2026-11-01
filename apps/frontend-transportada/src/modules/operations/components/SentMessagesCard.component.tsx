/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createOperationsClient } from '../shared/operationsClient.service'
import {
  failureRate,
  SENT_MESSAGES_PERIODS,
  sentMessagesWindow,
  type SentMessagesPeriodKey,
  type SentMessagesTotals,
} from '../shared/sentMessages.service'
import styles from '../styles/operationsWorkspace.module.css'

const SENT_MESSAGES_QUERY_KEY = 'operations-sent-messages'
const SENT_MESSAGES_REFRESH_MS = 60_000
const TOP_SUBCATEGORIES = 12

function getClient() {
  return createOperationsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

type BreakdownItem = Readonly<{ key: string; label: string; totals: SentMessagesTotals }>

/** Spec 290: quantas mensagens a plataforma enviou, por canal e por categoria, no período escolhido. */
export function SentMessagesCard(): JSX.Element {
  const { t } = useTranslation('operationsWorkspace')
  const [period, setPeriod] = useState<SentMessagesPeriodKey>('day')
  const query = useQuery({
    queryFn: () => getClient().getSentMessages(sentMessagesWindow(period, new Date())),
    queryKey: [SENT_MESSAGES_QUERY_KEY, period],
    refetchInterval: SENT_MESSAGES_REFRESH_MS,
  })
  const data = query.data

  return (
    <section aria-labelledby="sent-messages-title" className={styles.panel}>
      <header className={styles.sentMessagesHeader}>
        <h2 id="sent-messages-title">{t('sentMessages.title')}</h2>
        <div aria-label={t('sentMessages.period.label')} role="group">
          {SENT_MESSAGES_PERIODS.map((entry) => (
            <button
              aria-pressed={period === entry.key}
              className={styles.sentMessagesPeriod}
              key={entry.key}
              onClick={() => setPeriod(entry.key)}
              type="button"
            >
              {t(`sentMessages.period.${entry.key}`)}
            </button>
          ))}
        </div>
      </header>

      {query.isError ? (
        <p className={styles.boundary} role="alert">
          {t('sentMessages.error')}
        </p>
      ) : data === undefined ? (
        <Skeleton height="6rem" />
      ) : (
        <>
          <div className={styles.sentMessagesTotal}>
            <strong>{data.total.total}</strong>
            <small>
              {t('sentMessages.totalDetail', {
                failed: data.total.failed,
                rate: failureRate(data.total) ?? 0,
              })}
            </small>
          </div>
          {data.unavailable.length > 0 ? (
            <p className={styles.boundary} role="status">
              {t('sentMessages.unavailable', { sources: data.unavailable.join(', ') })}
            </p>
          ) : null}
          {data.total.total === 0 ? (
            <p>{t('sentMessages.empty')}</p>
          ) : (
            <div className={styles.sentMessagesColumns}>
              <Breakdown
                items={data.byChannel.map(
                  (entry): BreakdownItem => ({
                    key: entry.channel,
                    label: t(`sentMessages.channel.${entry.channel}`, {
                      defaultValue: entry.channel,
                    }),
                    totals: entry,
                  }),
                )}
                title={t('sentMessages.byChannel')}
              />
              <Breakdown
                items={data.byCategory.map(
                  (entry): BreakdownItem => ({
                    key: entry.category,
                    label: t(`sentMessages.category.${entry.category}`, {
                      defaultValue: entry.category,
                    }),
                    totals: entry,
                  }),
                )}
                title={t('sentMessages.byCategory')}
              />
              <Breakdown
                items={data.bySubcategory.slice(0, TOP_SUBCATEGORIES).map(
                  (entry): BreakdownItem => ({
                    key: `${entry.category}/${entry.channel}/${entry.audience}/${entry.subcategory}`,
                    label: [
                      t(`sentMessages.subcategory.${entry.subcategory}`, {
                        defaultValue: entry.subcategory,
                      }),
                      entry.audience === ''
                        ? ''
                        : t(`sentMessages.audience.${entry.audience}`, {
                            defaultValue: entry.audience,
                          }),
                      t(`sentMessages.channel.${entry.channel}`, { defaultValue: entry.channel }),
                    ]
                      .filter((part) => part !== '')
                      .join(' · '),
                    totals: entry,
                  }),
                )}
                title={t('sentMessages.bySubcategory')}
              />
            </div>
          )}
          <small>{t('sentMessages.footnote')}</small>
        </>
      )}
    </section>
  )
}

function Breakdown(
  props: Readonly<{ items: readonly BreakdownItem[]; title: string }>,
): JSX.Element {
  const { t } = useTranslation('operationsWorkspace')
  return (
    <div>
      <h3>{props.title}</h3>
      <ul className={styles.list}>
        {props.items.map((item) => (
          <li className={styles.listItem} key={item.key}>
            <span>{item.label}</span>
            <strong>
              {item.totals.total}
              {item.totals.failed > 0 ? (
                <small> {t('sentMessages.failedShort', { failed: item.totals.failed })}</small>
              ) : null}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
