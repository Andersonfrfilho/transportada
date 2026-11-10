/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  NfeXmlAllowedDomainRequestError,
  type NfeXmlAllowedDomain,
} from '../shared/nfeXmlAllowedDomains.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeXmlAllowedDomainsPanelProps = Readonly<{
  contractors: readonly Readonly<{ id: string; label: string }>[]
  domains: readonly NfeXmlAllowedDomain[] | undefined
  failed: boolean
  loading: boolean
  onRelease: (input: Readonly<{ contractorId: string; domain: string }>) => Promise<unknown>
  onSetStatus: (input: Readonly<{ id: string; status: 'active' | 'inactive' }>) => Promise<unknown>
  pending: boolean
}>

export function NfeXmlAllowedDomainsPanel({
  contractors,
  domains,
  failed,
  loading,
  onRelease,
  onSetStatus,
  pending,
}: NfeXmlAllowedDomainsPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [domain, setDomain] = useState('')
  const [contractorId, setContractorId] = useState('')
  const [errorCode, setErrorCode] = useState<null | string>(null)
  const items = domains ?? []
  const canSubmit = domain.trim().length > 0 && contractorId.length > 0 && !pending

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setErrorCode(null)
    try {
      await onRelease({ contractorId, domain: domain.trim() })
      setDomain('')
    } catch (error) {
      setErrorCode(error instanceof NfeXmlAllowedDomainRequestError ? error.code : 'unknown')
    }
  }

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-xml-domains-title">
      <div className={styles.panelHeading}>
        <div className={styles.panelHeadingRow}>
          <h2 id="nfe-xml-domains-title">{t('allowedDomains.title')}</h2>
          <span className={styles.countBadge}>
            {t('allowedDomains.count', { count: items.length })}
          </span>
        </div>
        <p>{t('allowedDomains.subtitle')}</p>
      </div>
      <form className={styles.domainForm} onSubmit={(event) => void handleSubmit(event)}>
        <label className={styles.domainField}>
          <span>{t('allowedDomains.domainLabel')}</span>
          <input
            autoComplete="off"
            onChange={(event) => setDomain(event.target.value)}
            placeholder={t('allowedDomains.domainPlaceholder')}
            value={domain}
          />
        </label>
        <div className={styles.domainField}>
          <span>{t('allowedDomains.contractorLabel')}</span>
          <SearchableSelect
            ariaLabel={t('allowedDomains.contractorLabel')}
            emptyLabel={t('allowedDomains.contractorEmpty')}
            onChange={setContractorId}
            options={contractors.map((contractor) => ({
              label: contractor.label,
              value: contractor.id,
            }))}
            placeholder={t('allowedDomains.contractorPlaceholder')}
            searchPlaceholder={t('allowedDomains.contractorSearch')}
            value={contractorId}
          />
        </div>
        <div className={styles.domainActions}>
          <Button disabled={!canSubmit} type="submit">
            {t('allowedDomains.release')}
          </Button>
        </div>
        {errorCode !== null && (
          <p className={`${styles.cardError} ${styles.domainFormError}`} role="alert">
            {t(`allowedDomains.error.${errorCode}`, {
              defaultValue: t('allowedDomains.error.unknown'),
            })}
          </p>
        )}
      </form>
      <div className={styles.scrollList}>
        {failed && <p className={styles.cardError}>{t('allowedDomains.loadError')}</p>}
        {!failed && loading && (
          <SkeletonGroup label={t('allowedDomains.loading')}>
            <Skeleton variant="text" width="60%" />
          </SkeletonGroup>
        )}
        {!failed && !loading && items.length === 0 && (
          <p className={styles.emptyState}>{t('allowedDomains.empty')}</p>
        )}
        {items.map((item, index) => (
          <article
            className={index % 2 === 0 ? styles.importCard : styles.importCardAlt}
            key={item.id}
          >
            <header className={styles.cardHeader}>
              <div className={styles.cardIdentity}>
                <span>@{item.domain}</span>
                <span className={styles.secondaryText}>
                  {item.contractorName ?? t('allowedDomains.noContractor')}
                </span>
              </div>
              <span
                className={`${styles.badge} ${item.status === 'active' ? styles.badgeReady : styles.badgeWarning}`}
              >
                {t(`allowedDomains.status.${item.status}`)}
              </span>
            </header>
            <Button
              disabled={pending}
              onClick={() =>
                void onSetStatus({
                  id: item.id,
                  status: item.status === 'active' ? 'inactive' : 'active',
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {t(item.status === 'active' ? 'allowedDomains.turnOff' : 'allowedDomains.turnOn')}
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}
