/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { DriverOccurrenceType } from '../shared/driverTrip.types'
import { resolveOccurrenceAttachmentMode } from '../shared/occurrenceRegistration.service'
import {
  buildOccurrenceTypeList,
  OCCURRENCE_TYPE_SEARCH_MIN_TYPES,
  readOccurrenceTypeUsage,
  resolveOccurrenceTypeUsageStorage,
} from '../shared/occurrenceTypeList.service'
import styles from '../styles/driverTrip.module.css'
import { OccurrenceTypeIcon } from './OccurrenceTypeIcon.component'

type OccurrenceTypePickerProps = Readonly<{
  onSelect: (typeId: string) => void
  selectedTypeId: string | undefined
  types: readonly DriverOccurrenceType[]
}>

/**
 * A lista de tipos do registro: campo de busca (a partir de {@link OCCURRENCE_TYPE_SEARCH_MIN_TYPES}
 * tipos), "Mais usados" deste aparelho e um grupo por onde a ocorrência acontece (parada ou nota).
 * Cor e ícone ajudam a achar; o nome e a exigência de foto continuam em todo chip.
 */
export function OccurrenceTypePicker({
  onSelect,
  selectedTypeId,
  types,
}: OccurrenceTypePickerProps) {
  const { t } = useTranslation('driverTrip')
  const [query, setQuery] = useState('')
  /** Escolhido o tipo, a lista recolhe: a foto e o "Registrar" ficam à vista, sem rolar a lista inteira. */
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [usage] = useState(() => readOccurrenceTypeUsage(resolveOccurrenceTypeUsageStorage()))
  const list = useMemo(
    () => buildOccurrenceTypeList({ query, types, usage }),
    [query, types, usage],
  )
  const hasSearch = types.length >= OCCURRENCE_TYPE_SEARCH_MIN_TYPES

  function handleSelect(typeId: string): void {
    onSelect(typeId)
    setIsCollapsed(true)
  }

  function handleChange(): void {
    setQuery('')
    setIsCollapsed(false)
  }

  const selectedType = types.find((type) => type.id === selectedTypeId)

  function renderChip(type: DriverOccurrenceType, keyPrefix: string) {
    const isSelected = type.id === selectedTypeId
    return (
      <Button
        aria-checked={isSelected}
        className={styles.occurrenceChip}
        key={`${keyPrefix}:${type.id}`}
        onClick={() => handleSelect(type.id)}
        role="radio"
        type="button"
        variant={isSelected ? 'default' : 'ghost'}
      >
        <OccurrenceTypeIcon iconName={type.iconName} />
        <span className={styles.occurrenceChipLabel}>
          <span>{type.name}</span>
          <span className={styles.occurrenceChipMode}>
            {t(`occurrenceRegistration.attachment.${resolveOccurrenceAttachmentMode(type)}`)}
          </span>
        </span>
      </Button>
    )
  }

  if (isCollapsed && selectedType !== undefined) {
    return (
      <div className={styles.occurrencePicker}>
        <div
          aria-label={t('occurrenceRegistration.legend')}
          className={styles.occurrenceChips}
          role="radiogroup"
        >
          {renderChip(selectedType, 'selected')}
        </div>
        <Button onClick={handleChange} type="button" variant="ghost">
          {t('occurrenceRegistration.changeType')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.occurrencePicker}>
      {hasSearch ? (
        <>
          <input
            aria-label={t('occurrenceRegistration.search.label')}
            autoComplete="off"
            className={styles.occurrenceSearch}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('occurrenceRegistration.search.placeholder')}
            type="search"
            value={query}
          />
        </>
      ) : null}
      <div aria-label={t('occurrenceRegistration.legend')} role="radiogroup">
        {list.frequent.length > 0 ? (
          <section className={styles.occurrenceGroup} data-group="frequent">
            <p className={styles.occurrenceGroupTitle}>
              {t('occurrenceRegistration.groups.frequent')}
            </p>
            <div className={styles.occurrenceChips}>
              {list.frequent.map((type) => renderChip(type, 'frequent'))}
            </div>
          </section>
        ) : null}
        {list.groups.map((group) => (
          <section className={styles.occurrenceGroup} data-group={group.flow} key={group.flow}>
            <p className={styles.occurrenceGroupTitle}>
              {t(`occurrenceRegistration.groups.${group.flow}`)}
            </p>
            <div className={styles.occurrenceChips}>
              {group.types.map((type) => renderChip(type, group.flow))}
            </div>
          </section>
        ))}
        {list.groups.length === 0 ? (
          <p className={styles.stopMeta} role="status">
            {t('occurrenceRegistration.search.empty')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
