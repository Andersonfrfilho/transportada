/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { ReadinessMark } from '@/modules/foundation/components/ReadinessMark.component'
import { useFoundationHealthQuery } from '@/modules/foundation/queries/useFoundationHealth.query'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

export function FoundationStatusPage() {
  const { t } = useTranslation()
  const foundationHealthQuery = useFoundationHealthQuery()
  const authMeQuery = useAuthMeQuery()
  const hasApiBaseUrl =
    import.meta.env.VITE_API_URL !== undefined && import.meta.env.VITE_API_URL !== ''
  const integrationKey = !hasApiBaseUrl
    ? 'foundation.integrationNotConfigured'
    : foundationHealthQuery.isSuccess && authMeQuery.isSuccess
      ? 'foundation.integrationReady'
      : 'foundation.integrationUnavailable'

  return (
    <main className="foundation-shell">
      <header className="foundation-header">
        <a className="wordmark" href="#status" aria-label={t('foundation.brand')}>
          <span aria-hidden="true">T/</span>
          {t('foundation.brand')}
        </a>
        <p className="classification">{t('foundation.classification')}</p>
      </header>

      <section className="foundation-hero" id="status" aria-labelledby="foundation-title">
        <div className="route-line" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="section-label">{t('foundation.operationDisabled')}</p>
        <h1 id="foundation-title">{t('foundation.title')}</h1>
        <p className="foundation-intro">{t('foundation.intro')}</p>
      </section>

      <section className="manifest" aria-labelledby="manifest-title">
        <div className="manifest-heading">
          <p className="section-label" id="manifest-title">
            {t('foundation.manifest')}
          </p>
          <ReadinessMark label={t('foundation.prepared')} />
        </div>
        <ol>
          <li>{t('foundation.manifestEntryOne')}</li>
          <li>{t('foundation.manifestEntryTwo')}</li>
          <li>{t('foundation.manifestEntryThree')}</li>
        </ol>
      </section>

      <section className="foundation-notes" aria-label={t('foundation.boundary')}>
        <article>
          <h2>{t('foundation.prepared')}</h2>
          <p>{t('foundation.preparedDescription')}</p>
        </article>
        <article>
          <h2>{t('foundation.boundary')}</h2>
          <p>{t('foundation.boundaryDescription')}</p>
        </article>
        <article>
          <h2>{t('foundation.integration')}</h2>
          <p>{t(integrationKey)}</p>
        </article>
      </section>

      <footer>{t('foundation.footer')}</footer>
    </main>
  )
}
