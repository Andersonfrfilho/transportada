/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { useDriverAttachmentSuggestion } from '../hooks/useDriverAttachments.hook'
import {
  planLicenseSuggestion,
  type LicenseSuggestionField,
} from '../shared/driverLicenseSuggestion.service'
import styles from '../styles/fleet.module.css'
import { FleetFeedback } from './FleetFeedback.component'

export type DriverLicenseFields = Readonly<Record<LicenseSuggestionField, string>>

type DriverLicenseSuggestionProps = Readonly<{
  attachmentId: string
  current: DriverLicenseFields
  driverId: string
  /** Só preenche o formulário aberto. Quem grava a ficha é o botão Salvar, como em qualquer digitação. */
  onFill: (field: LicenseSuggestionField, value: string) => void
}>

/**
 * Spec 091 T018: a leitura da CNH anexada, **oferecida** campo a campo. Só campo vazio recebe oferta,
 * divergência avisa sem corrigir, e aceitar não grava: preenche o formulário e a ficha só muda no Salvar.
 * Concluir — com ou sem aceite — descarta a leitura no servidor.
 */
export function DriverLicenseSuggestion({
  attachmentId,
  current,
  driverId,
  onFill,
}: DriverLicenseSuggestionProps) {
  const { t } = useTranslation('fleet')
  const [filled, setFilled] = useState<ReadonlySet<LicenseSuggestionField>>(new Set())
  const { decideMutation, suggestionQuery } = useDriverAttachmentSuggestion({
    attachmentId,
    driverId,
    enabled: true,
  })
  const fields = suggestionQuery.data?.fields ?? null
  if (fields === null) return null

  const entries = planLicenseSuggestion({ current, suggestion: fields })

  return (
    <div className={styles.fuelPriceForm}>
      <p className={styles.hint}>{t('driverAttachments.suggestion.hint')}</p>
      {entries.length === 0 ? <p>{t('driverAttachments.suggestion.nothingToOffer')}</p> : null}
      <ul>
        {entries.map((entry) => (
          <li key={entry.field}>
            <strong>{t(`driverAttachments.suggestion.fields.${entry.field}`)}</strong>{' '}
            {entry.status === 'offer' ? (
              <>
                {t('driverAttachments.suggestion.read', { value: entry.read })}{' '}
                <button
                  className={styles.secondaryAction}
                  disabled={filled.has(entry.field)}
                  type="button"
                  onClick={() => {
                    onFill(entry.field, entry.read)
                    setFilled(new Set([...filled, entry.field]))
                  }}
                >
                  <Icon name="check" />
                  {t(
                    filled.has(entry.field)
                      ? 'driverAttachments.suggestion.filled'
                      : 'driverAttachments.suggestion.use',
                  )}
                </button>
              </>
            ) : entry.status === 'matches' ? (
              t('driverAttachments.suggestion.matches')
            ) : (
              t('driverAttachments.suggestion.diverges', {
                current: entry.current,
                read: entry.read,
              })
            )}
          </li>
        ))}
      </ul>
      {filled.size > 0 ? (
        <p className={styles.hint}>{t('driverAttachments.suggestion.saveHint')}</p>
      ) : null}
      {decideMutation.isError ? (
        <FleetFeedback isError reveal={false}>
          {t('driverAttachments.errors.default')}
        </FleetFeedback>
      ) : null}
      <div className={styles.fuelPriceActions}>
        <button
          className={styles.secondaryAction}
          disabled={decideMutation.isPending}
          type="button"
          onClick={() => decideMutation.mutate(filled.size > 0 ? 'accepted' : 'dismissed')}
        >
          <Icon name="close" />
          {t(
            filled.size > 0
              ? 'driverAttachments.suggestion.finish'
              : 'driverAttachments.suggestion.dismiss',
          )}
        </button>
      </div>
    </div>
  )
}
