/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Icon } from '@/components/ui/icon'
import {
  OCCURRENCE_TYPE_ICON_NAMES,
  type OccurrenceTypeIconName,
} from '@/modules/trip/shared/occurrenceTypeIcon.constant'

import styles from '../styles/trip.module.css'

type OccurrenceTypeIconProps = Readonly<{
  iconName?: null | string | undefined
}>

function isOccurrenceTypeIconName(value: string): value is OccurrenceTypeIconName {
  return (OCCURRENCE_TYPE_ICON_NAMES as readonly string[]).includes(value)
}

export function OccurrenceTypeIcon({ iconName }: OccurrenceTypeIconProps) {
  if (iconName === undefined || iconName === null || !isOccurrenceTypeIconName(iconName)) {
    return null
  }
  return <Icon className={styles.occurrenceEntryTypeIcon ?? ''} name={iconName} size="sm" />
}
