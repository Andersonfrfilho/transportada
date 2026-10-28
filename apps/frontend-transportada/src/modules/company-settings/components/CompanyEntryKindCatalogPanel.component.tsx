/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P2/P3: o cadastro de espécie de lançamento (gasto/receita) — nome, lado, ativa. Nasce
 * hoje só com `Pedágio` e `Avulso`, semeados como `expense` na migration (RF2); daqui em diante,
 * quem tem `settings.manage` cadastra o que faltar, sem deploy.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import {
  COMPANY_ENTRY_KIND_SIDES,
  type CompanyEntryKind,
  type CompanyEntryKindSide,
} from '@/modules/trip-financials/shared/tripFinancials.types'
import styles from '../styles/businessCalendar.module.css'

export type CompanyEntryKindCatalogPanelProps = Readonly<{
  canManage: boolean
  isDeactivating: boolean
  isSaving: boolean
  kinds: readonly CompanyEntryKind[]
  onCreate: (input: Readonly<{ name: string; side: CompanyEntryKindSide }>) => void
  onDeactivate: (entryKindId: string) => void
}>

export function CompanyEntryKindCatalogPanel({
  canManage,
  isDeactivating,
  isSaving,
  kinds,
  onCreate,
  onDeactivate,
}: CompanyEntryKindCatalogPanelProps) {
  const { t } = useTranslation('companySettings')
  const [name, setName] = useState('')
  const [side, setSide] = useState<CompanyEntryKindSide>('expense')

  function handleCreate(): void {
    if (name.trim() === '') return
    onCreate({ name: name.trim(), side })
    setName('')
  }

  return (
    <section aria-labelledby="entry-kinds-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id="entry-kinds-title">{t('entryKinds.title')}</h2>
        <p className={styles.hint}>{t('entryKinds.subtitle')}</p>
      </div>

      {/* CA03: gasto e receita não compartilham a lista — cada lado com a própria coluna. */}
      {COMPANY_ENTRY_KIND_SIDES.map((entrySide) => (
        <section className={styles.block} key={entrySide}>
          <h3>{t(`entryKinds.side.${entrySide}`)}</h3>
          {kinds.filter((kind) => kind.side === entrySide).length === 0 ? (
            <p className={styles.hint}>{t('entryKinds.empty')}</p>
          ) : (
            <ul className={styles.kindList}>
              {kinds
                .filter((kind) => kind.side === entrySide)
                .map((kind) => (
                  <li className={styles.kindRow} key={kind.id}>
                    <span>{kind.name}</span>
                    {kind.active ? (
                      canManage ? (
                        <Button
                          disabled={isDeactivating}
                          onClick={() => onDeactivate(kind.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Icon name="trash" />
                          {t('entryKinds.deactivate')}
                        </Button>
                      ) : null
                    ) : (
                      <span className={styles.hint}>{t('entryKinds.inactive')}</span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}

      {canManage ? (
        <section className={styles.block}>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="entry-kind-name">
                {t('entryKinds.name')}
              </label>
              <input
                className={styles.input}
                id="entry-kind-name"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{t('entryKinds.side.label')}</span>
              <Select
                ariaLabel={t('entryKinds.side.label')}
                onChange={(value) => setSide(value as CompanyEntryKindSide)}
                options={COMPANY_ENTRY_KIND_SIDES.map((entrySide) => ({
                  label: t(`entryKinds.side.${entrySide}`),
                  value: entrySide,
                }))}
                value={side}
              />
            </div>
            <div className={styles.actions}>
              <Button
                disabled={isSaving || name.trim() === ''}
                onClick={handleCreate}
                type="button"
              >
                <Icon name="save" />
                {isSaving ? t('entryKinds.saving') : t('entryKinds.save')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
