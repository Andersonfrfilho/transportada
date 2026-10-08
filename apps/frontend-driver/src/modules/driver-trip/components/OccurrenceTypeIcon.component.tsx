/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Icon } from '@/components/ui/icon'

import { isOccurrenceTypeIconName } from '../shared/occurrenceTypeIcon.constant'

type OccurrenceTypeIconProps = Readonly<{
  iconName: null | string | undefined
}>

/** Nome ausente, nulo ou fora do catálogo não desenha nada: o chip fica como era. */
export function OccurrenceTypeIcon({ iconName }: OccurrenceTypeIconProps) {
  if (!isOccurrenceTypeIconName(iconName)) return null
  return <Icon name={iconName} />
}
