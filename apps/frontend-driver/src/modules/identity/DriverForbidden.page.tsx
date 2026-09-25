/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

/** RF3 (ADR-0075 §2): sem `trip.read` a mensagem é essa, sem link — a conta não é de motorista. */
export function DriverForbiddenPage() {
  const { t } = useTranslation('identity')

  return (
    <main className="page">
      <div className="panel">
        <h1 className="page__title">{t('forbidden.title')}</h1>
        <p role="alert">{t('forbidden.message')}</p>
      </div>
    </main>
  )
}
