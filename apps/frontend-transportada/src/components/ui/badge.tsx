/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'success'

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant
}

const VARIANT_CLASS: Readonly<Record<BadgeVariant, string>> = {
  default: 'ui-badge-default',
  secondary: 'ui-badge-secondary',
  success: 'ui-badge-success',
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span className={cn('ui-badge', VARIANT_CLASS[variant], className)} {...props} />
}
