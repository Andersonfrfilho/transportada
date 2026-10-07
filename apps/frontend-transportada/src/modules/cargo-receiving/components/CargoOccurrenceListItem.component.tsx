/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import { formatOccurrenceItemQuantity } from '../shared/cargoOccurrenceFormat.service'
import styles from '../styles/cargoOccurrence.module.css'
import officeStyles from '../styles/cargoOccurrenceOffice.module.css'
import receivingStyles from '../styles/cargoReceiving.module.css'
import { CargoOccurrenceCaseActions } from './CargoOccurrenceCaseActions.component'

type CargoOccurrenceListItemProps = Readonly<{
  noteNumber: string | undefined
  occurrence: CargoOccurrenceView
}>

function OccurrencePhotos({
  occurrence,
}: Readonly<{ occurrence: CargoOccurrenceView }>): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (occurrence.attachments.length === 0) return null
  return (
    <div className={officeStyles.occurrencePhotos}>
      {occurrence.attachments.map((attachment) => {
        const source = attachment.thumbnailUrl ?? attachment.downloadUrl
        if (attachment.expired || source === undefined) {
          return (
            <p className={styles.noteHint} key={attachment.id}>
              {t('occurrence.list.photoGone')}
            </p>
          )
        }
        return (
          <a
            href={attachment.downloadUrl ?? source}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt={t('occurrence.list.photoAlt')}
              className={officeStyles.occurrenceThumb}
              src={source}
            />
          </a>
        )
      })}
    </div>
  )
}

function OccurrenceItemLines({
  occurrence,
}: Readonly<{ occurrence: CargoOccurrenceView }>): JSX.Element {
  const { t, i18n } = useTranslation('cargoReceiving')
  const locale = i18n.resolvedLanguage ?? 'pt-BR'
  const unitLabels = { box: t('occurrence.items.unit.box'), unit: t('occurrence.items.unit.unit') }

  return (
    <ul className={officeStyles.occurrenceItems}>
      {occurrence.items.map((item) => {
        const quantity = formatOccurrenceItemQuantity({ item, locale, unitLabels })
        return (
          <li key={item.code}>
            {quantity === undefined
              ? t('occurrence.list.item', { code: item.code, description: item.description })
              : t('occurrence.list.itemWithQuantity', {
                  code: item.code,
                  description: item.description,
                  quantity,
                })}
          </li>
        )
      })}
    </ul>
  )
}

/** Uma avaria da chegada: o tipo, a nota, os itens com a contagem, a foto, a situação da tratativa e as ações que a conduzem. */
export function CargoOccurrenceListItem({
  noteNumber,
  occurrence,
}: CargoOccurrenceListItemProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()

  return (
    <li className={officeStyles.occurrenceItem} data-occurrence-id={occurrence.id}>
      <div className={officeStyles.occurrenceHead}>
        <span className={officeStyles.occurrenceType}>{occurrence.typeName}</span>
        <span className={receivingStyles.badge} data-case-status="">
          {occurrence.case === null
            ? t('occurrence.case.none')
            : t(`occurrence.case.${occurrence.case.status}`)}
        </span>
      </div>
      <ul className={officeStyles.occurrenceMeta}>
        <li>
          {noteNumber === undefined
            ? t('occurrence.list.unknownNote')
            : t('document.number', { number: noteNumber })}
          {' · '}
          {formatMoment(occurrence.createdAt)}
          {occurrence.actorName === null ? '' : ` · ${occurrence.actorName}`}
        </li>
        {occurrence.note === '' ? null : <li>{occurrence.note}</li>}
      </ul>
      <OccurrenceItemLines occurrence={occurrence} />
      <OccurrencePhotos occurrence={occurrence} />
      <CargoOccurrenceCaseActions noteNumber={noteNumber} occurrence={occurrence} />
    </li>
  )
}
