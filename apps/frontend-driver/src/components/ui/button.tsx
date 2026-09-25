/* Cópia por valor de apps/frontend-transportada/src/components/ui/button.tsx (ADR-0075 §7). */
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

/**
 * O mesmo conjunto de classes que `Button` aplica, para quem recebe um `className` e monta o
 * próprio `<button>`. Repetir os nomes no call site faria a mudança de uma variante parar aqui.
 */
export function buttonClassName(
  input: Readonly<{
    className?: string | undefined
    size?: ButtonSize | undefined
    variant?: ButtonVariant | undefined
  }> = {},
): string {
  return cn(
    'ui-button',
    SIZE_CLASS[input.size ?? 'default'],
    VARIANT_CLASS[input.variant ?? 'default'],
    input.className,
  )
}

export function Button({
  asChild,
  children,
  className,
  size = 'default',
  variant = 'default',
  ...props
}: ButtonProps) {
  const resolvedClassName = buttonClassName({ className, size, variant })
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ readonly className?: string }>
    return cloneElement(child, {
      className: cn(resolvedClassName, child.props.className),
    })
  }
  return (
    <button className={resolvedClassName} {...props}>
      {children}
    </button>
  )
}
