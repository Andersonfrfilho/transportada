/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

type AdvancedFilterClearButtonProps = Readonly<{
  conditionCount: number
  label: string
  onClear: () => void
}>

export function AdvancedFilterClearButton({
  conditionCount,
  label,
  onClear,
}: AdvancedFilterClearButtonProps): JSX.Element {
  return (
    <Button
      aria-label={label}
      disabled={conditionCount === 0}
      onClick={onClear}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon name="filter-clear" />
      {label}
    </Button>
  )
}
