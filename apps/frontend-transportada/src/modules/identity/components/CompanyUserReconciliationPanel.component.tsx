import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { summarizeReconciliation } from '@adatechnology/identity-reconciliation'

import { toSynchronizeTargets } from '../shared/reconciliationTargets.service'
import type {
  IdentitySyncOutcome,
  ProfileFillOutcome,
  ReconciliationEntry,
  ReconciliationStatus,
} from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserReconciliationPanelProps = Readonly<{
  entries: readonly ReconciliationEntry[]
  hasMoreRealmUsers: boolean
  isLoading: boolean
  isOpen: boolean
  onRefresh: () => void
  onFillProfiles: (userIds: readonly string[]) => void
  onSynchronize: (
    targets: Readonly<{ subjects: readonly string[]; userIds: readonly string[] }>,
  ) => void
  onToggle: () => void
  fillOutcome?: ProfileFillOutcome | undefined
  isFillingProfiles?: boolean
  isSynchronizing?: boolean
  syncOutcome?: IdentitySyncOutcome | undefined
  errorCode?: string
}>

const STATUS_CLASS: Readonly<Record<ReconciliationStatus, keyof typeof styles>> = {
  linked: 'statusActive',
  'missing-in-realm': 'statusInvited',
  'missing-locally': 'statusSuspended',
  'profile-missing': 'statusInvited',
}

/**
 * A comparação com o Keycloak precisa aparecer, e não só existir na API: quem está de um lado só é
 * invisível na listagem normal — foi assim que uma conta ficou meses sem ninguém notar.
 */
export function CompanyUserReconciliationPanel({
  entries,
  errorCode,
  fillOutcome,
  hasMoreRealmUsers,
  isFillingProfiles = false,
  isLoading,
  isOpen,
  isSynchronizing = false,
  onFillProfiles,
  onRefresh,
  onSynchronize,
  onToggle,
  syncOutcome,
}: CompanyUserReconciliationPanelProps) {
  const { t } = useTranslation('identity')
  const { divergent, missingSomewhere, withoutProfile } = summarizeReconciliation(entries)

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
              : [
                  missingSomewhere.length === 0
                    ? ''
                    : t('users.sync.missingCount', { count: missingSomewhere.length }),
                  withoutProfile.length === 0
                    ? ''
                    : t('users.sync.profileMissingCount', { count: withoutProfile.length }),
                ]
                  .filter((sentence) => sentence !== '')
                  .join(' ')}
          </p>

          {/**
           * Os dois botões ficam **acima** da tabela, ao lado da contagem que explica cada um. No
           * rodapé eles caíam depois de uma tabela rolável: quem lia "1 acesso em um lado só" no topo
           * precisava rolar até o fim para achar o que fazer a respeito.
           */}
          {missingSomewhere.length === 0 && withoutProfile.length === 0 ? null : (
            <div className={styles.panelActions}>
              {withoutProfile.length === 0 ? null : (
                <Button
                  disabled={isFillingProfiles}
                  onClick={() =>
                    onFillProfiles(withoutProfile.map((entry) => entry.local?.userId ?? ''))
                  }
                  type="button"
                  variant="ghost"
                >
                  <Icon name="download" />
                  {t('users.sync.fillAllProfiles', { count: withoutProfile.length })}
                </Button>
              )}
              {missingSomewhere.length === 0 ? null : (
                <Button
                  disabled={isSynchronizing}
                  onClick={() => onSynchronize(toSynchronizeTargets(missingSomewhere))}
                  type="button"
                >
                  <Icon name="refresh" />
                  {t('users.sync.createAll', { count: missingSomewhere.length })}
                </Button>
              )}
            </div>
          )}

          <ReconciliationOutcome fillOutcome={fillOutcome} syncOutcome={syncOutcome} />

          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th>{t('users.sync.column.person')}</th>
                  <th>{t('users.sync.column.here')}</th>
                  <th>{t('users.sync.column.realm')}</th>
                  <th>{t('users.sync.column.status')}</th>
                  <th>{t('users.sync.column.matchedBy')}</th>
                  <th>{t('users.sync.column.action')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.local?.userId ?? entry.realm?.subject}>
                    <td>{personLabelOf(entry, t('users.sync.noProfile'))}</td>
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
                      {entry.status === 'linked' ? null : entry.status === 'profile-missing' ? (
                        <Button
                          disabled={isFillingProfiles}
                          onClick={() => onFillProfiles([entry.local?.userId ?? ''])}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Icon name="download" />
                          {t('users.sync.fillProfile')}
                        </Button>
                      ) : (
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
 * O que o último clique fez. A API sempre devolveu `{filled, skipped}` e `{created…, skipped}`, e o
 * cliente jogava fora: preencher uma ficha e pular outra produzia exatamente a mesma tela de antes
 * do clique, e quem clicou concluía que o botão não funcionava.
 */
function ReconciliationOutcome({
  fillOutcome,
  syncOutcome,
}: Readonly<{
  fillOutcome: ProfileFillOutcome | undefined
  syncOutcome: IdentitySyncOutcome | undefined
}>) {
  const { t } = useTranslation('identity')
  if (fillOutcome === undefined && syncOutcome === undefined) return null

  const created =
    (syncOutcome?.createdInRealm.length ?? 0) + (syncOutcome?.createdLocally.length ?? 0)
  const skipped = [
    ...(fillOutcome?.skipped ?? []).map((entry) => entry.reason),
    ...(syncOutcome?.skipped ?? []).map((entry) => entry.reason),
  ]

  return (
    /* O resultado do conserto é trabalho feito, não falha — e `feedback` sozinha é vermelha. */
    <p className={`${styles.feedback ?? ''} ${styles.noticeReady ?? ''}`} role="status">
      {fillOutcome === undefined
        ? null
        : `${t('users.sync.outcome.filled', { count: fillOutcome.filled.length })} `}
      {syncOutcome === undefined ? null : `${t('users.sync.outcome.created', { count: created })} `}
      {skipped.length === 0
        ? null
        : t('users.sync.outcome.skipped', {
            count: skipped.length,
            reasons: [...new Set(skipped)]
              .map((reason) => t(`users.sync.skipReason.${reason}`, { defaultValue: reason }))
              .join(', '),
          })}
    </p>
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
