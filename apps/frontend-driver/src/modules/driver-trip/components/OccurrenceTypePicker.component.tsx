/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { DriverOccurrenceType } from '../shared/driverTrip.types'
import type { OccurrenceAvailability } from '../shared/occurrenceAvailability.service'
import { resolveOccurrenceAttachmentMode } from '../shared/occurrenceRegistration.service'
import { isReceivingChargeType } from '../shared/receivingCharge.service'
import {
  buildOccurrenceTypeList,
  readOccurrenceTypeUsage,
  resolveOccurrenceTypeUsageStorage,
} from '../shared/occurrenceTypeList.service'
import styles from '../styles/driverTrip.module.css'
import { OccurrenceTypeIcon } from './OccurrenceTypeIcon.component'

type OccurrenceTypePickerProps = Readonly<{
  /** Spec 315 (T7b): o tipo com espera mínima fica desabilitado até abrir; ausente, todo tipo está disponível. */
  getAvailability?: (type: DriverOccurrenceType) => OccurrenceAvailability
  onSelect: (typeId: string) => void
  selectedTypeId: string | undefined
  types: readonly DriverOccurrenceType[]
}>

/**
 * A lista de tipos do registro: campo de busca, "Mais usados" deste aparelho e um grupo por onde a ocorrência acontece (parada ou nota).
 * Cor e ícone ajudam a achar; o nome e a exigência de foto continuam em todo chip.
 */
export function OccurrenceTypePicker({
  getAvailability,
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

  function handleSelect(typeId: string): void {
    onSelect(typeId)
    setIsCollapsed(true)
  }

  function handleChange(): void {
    setQuery('')
    setIsCollapsed(false)
  }

  const selectedType = types.find((type) => type.id === selectedTypeId)

  /** Spec 317: o tipo com vagas diz quantas fotos pede (as do servidor), em vez do "Sem foto" da foto única. */
  function describeAttachment(type: DriverOccurrenceType): string {
    if (isReceivingChargeType(type)) {
      const required = (type.photoSlots ?? []).filter((slot) => slot.required).length
      if (required > 0) return t('occurrenceRegistration.attachment.slots', { count: required })
    }
    return t(`occurrenceRegistration.attachment.${resolveOccurrenceAttachmentMode(type)}`)
  }

  /** Spec 315 (T7b): por que o tipo não abre agora — o que falta, em texto, nunca só a cor. */
  function describeBlock(availability: OccurrenceAvailability): string | undefined {
    switch (availability.status) {
      case 'available':
        return undefined
      case 'alreadyOpen':
        return t('occurrenceRegistration.availability.alreadyOpen')
      case 'alreadyOpenOnNote':
        return t('occurrenceRegistration.availability.alreadyOpenOnNote')
      case 'needsArrival':
        return t('occurrenceRegistration.availability.needsArrival')
      case 'arrivalSyncing':
        return t('occurrenceRegistration.availability.arrivalSyncing')
      case 'waiting':
        return t('occurrenceRegistration.availability.waiting', {
          count: availability.remainingMinutes,
          time: new Date(availability.availableAtMs).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
    }
  }

  function renderChip(type: DriverOccurrenceType, keyPrefix: string) {
    const isSelected = type.id === selectedTypeId
    const block = describeBlock(getAvailability?.(type) ?? { status: 'available' })
    return (
      <Button
        aria-checked={isSelected}
        className={styles.occurrenceChip}
        disabled={block !== undefined}
        key={`${keyPrefix}:${type.id}`}
        onClick={() => handleSelect(type.id)}
        role="radio"
        type="button"
        variant={isSelected ? 'default' : 'ghost'}
      >
        <OccurrenceTypeIcon iconName={type.iconName} />
        <span className={styles.occurrenceChipLabel}>
          <span>{type.name}</span>
          <span className={styles.occurrenceChipMode}>{block ?? describeAttachment(type)}</span>
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
      <input
        aria-label={t('occurrenceRegistration.search.label')}
        autoComplete="off"
        className={styles.occurrenceSearch}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('occurrenceRegistration.search.placeholder')}
        type="search"
        value={query}
      />
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
