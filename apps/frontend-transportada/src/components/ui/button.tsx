/* Copyright (c) 2026 Ada Technology. MIT License. */
import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

type ButtonSize = 'default' | 'sm'
type ButtonVariant = 'default' | 'ghost' | 'secondary'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly asChild?: boolean
  readonly size?: ButtonSize
  readonly variant?: ButtonVariant
}

const SIZE_CLASS: Readonly<Record<ButtonSize, string>> = {
  default: 'ui-button-size-default',
  sm: 'ui-button-size-sm',
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  default: 'ui-button-default',
  ghost: 'ui-button-ghost',
  secondary: 'ui-button-secondary',
}

export function Button({
  asChild,
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ButtonProps) {
  const buttonClassName = cn('ui-button', SIZE_CLASS[size], VARIANT_CLASS[variant], className)
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ readonly className?: string }>
    return cloneElement(child, {
      className: cn(buttonClassName, child.props.className),
    })
  }
  return (
    <button className={buttonClassName} {...props}>
      {children}
    </button>
  )
}
