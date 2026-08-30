/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import type { ReconciliationEntry, ReconciliationStatus } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserReconciliationPanelProps = Readonly<{
  entries: readonly ReconciliationEntry[]
  hasMoreRealmUsers: boolean
  isLoading: boolean
  isOpen: boolean
  onRefresh: () => void
  onSynchronize: (
    targets: Readonly<{ subjects: readonly string[]; userIds: readonly string[] }>,
  ) => void
  onToggle: () => void
  isSynchronizing?: boolean
  errorCode?: string
}>

const STATUS_CLASS: Readonly<Record<ReconciliationStatus, keyof typeof styles>> = {
  linked: 'statusActive',
  'missing-in-realm': 'statusInvited',
  'missing-locally': 'statusSuspended',
}

/**
 * A comparação com o Keycloak precisa aparecer, e não só existir na API: quem está de um lado só é
 * invisível na listagem normal — foi assim que uma conta ficou meses sem ninguém notar.
 */
export function CompanyUserReconciliationPanel({
  entries,
  errorCode,
  hasMoreRealmUsers,
  isLoading,
  isOpen,
  isSynchronizing = false,
  onRefresh,
  onSynchronize,
  onToggle,
}: CompanyUserReconciliationPanelProps) {
  const { t } = useTranslation('identity')
  const divergent = entries.filter((entry) => entry.status !== 'linked').length

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{t('users.sync.title')}</h2>
        <div className={styles.panelActions}>
          {isOpen ? (
            <Button onClick={onRefresh} type="button" variant="ghost">
              <Icon name="refresh" />
              {t('users.sync.refresh')}
            </Button>
          ) : null}
          <Button onClick={onToggle} type="button" variant="default">
            <Icon name={isOpen ? 'close' : 'search'} />
            {isOpen ? t('users.sync.hide') : t('users.sync.show')}
          </Button>
        </div>
      </div>

      <p className={styles.intro}>{t('users.sync.intro')}</p>

      {!isOpen ? null : isLoading ? (
        <Skeleton height="8rem" variant="block" />
      ) : errorCode !== undefined ? (
        <p className={styles.feedback} role="alert">
          {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
        </p>
      ) : (
        <>
          <p className={styles.intro}>
            {divergent === 0
              ? t('users.sync.allLinked')
              : t('users.sync.divergentCount', { count: divergent })}
          </p>

          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>{t('users.sync.column.person')}</th>
                  <th>{t('users.sync.column.here')}</th>
                  <th>{t('users.sync.column.realm')}</th>
                  <th>{t('users.sync.column.status')}</th>
                  <th>{t('users.sync.column.matchedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.local?.userId ?? entry.realm?.subject}>
                    <td>{personLabelOf(entry, t('users.sync.noProfile'))}</td>
                    {/* O contato é onde o convite grava o e-mail; a coluna `email` fica vazia. */}
                    <td>{entry.local === undefined ? '—' : entry.local.contact || '—'}</td>
                    <td>
                      {entry.realm === undefined ? '—' : entry.realm.email || entry.realm.username}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge ?? ''} ${styles[STATUS_CLASS[entry.status]] ?? ''}`}
                      >
                        {t(`users.sync.status.${entry.status}`)}
                      </span>
                    </td>
                    <td>{t(`users.sync.match.${entry.matchedBy}`)}</td>
                    <td>
                      {/* O botão só existe onde há o que criar: linha sincronizada não oferece ação. */}
                      {entry.status === 'linked' ? null : (
                        <Button
                          disabled={isSynchronizing}
                          onClick={() =>
                            onSynchronize(
                              entry.status === 'missing-in-realm'
                                ? { subjects: [], userIds: [entry.local?.userId ?? ''] }
                                : { subjects: [entry.realm?.subject ?? ''], userIds: [] },
                            )
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Icon name="refresh" />
                          {entry.status === 'missing-in-realm'
                            ? t('users.sync.createInRealm')
                            : t('users.sync.createLocally')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* O recorte é do realm: dizer que ele acabou quando não acabou esconde divergência. */}
          {/* Criar todos age sobre a divergência que está na tela, nunca sobre o realm inteiro. */}
          {divergent === 0 ? null : (
            <div className={styles.bulkActions}>
              <Button
                disabled={isSynchronizing}
                onClick={() =>
                  onSynchronize({
                    subjects: entries
                      .filter((entry) => entry.status === 'missing-locally')
                      .map((entry) => entry.realm?.subject ?? ''),
                    userIds: entries
                      .filter((entry) => entry.status === 'missing-in-realm')
                      .map((entry) => entry.local?.userId ?? ''),
                  })
                }
                type="button"
              >
                <Icon name="refresh" />
                {t('users.sync.createAll', { count: divergent })}
              </Button>
            </div>
          )}

          {hasMoreRealmUsers ? (
            <p className={styles.feedback} role="status">
              {t('users.sync.truncated')}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

/**
 * Nome vazio é vínculo sem perfil, e a tela precisa dizer isso: uma linha de traços parece defeito
 * de renderização, e quem a vê não descobre que falta cadastro.
 */
function personLabelOf(entry: ReconciliationEntry, noProfileLabel: string): string {
  const name = entry.local?.name ?? ''
  if (name !== '') return name
  const username = entry.realm?.username ?? ''
  if (username !== '') return username
  return entry.local === undefined ? '—' : noProfileLabel
}
