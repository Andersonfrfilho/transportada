/* Cópia por valor de apps/frontend-transportada/src/components/ui/button.tsx (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'ghost' | 'secondary'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly asChild?: boolean
  readonly variant?: ButtonVariant
}

const VARIANT_CLASS: Readonly<Record<ButtonVariant, string>> = {
  default: 'ui-button-default',
  ghost: 'ui-button-ghost',
  secondary: 'ui-button-secondary',
}

/**
 * O mesmo conjunto de classes que `Button` aplica, para quem recebe um `className` e monta o
 * próprio `<button>`. Repetir os nomes no call site faria a mudança de uma variante parar aqui.
 *
 * ⚠️ Sem variante de tamanho compacto (T3.6, `web.md` §10): o alvo de toque de 44px é o único que
 * esta app oferece.
 */
export function buttonClassName(
  input: Readonly<{
    className?: string | undefined
    variant?: ButtonVariant | undefined
  }> = {},
): string {
  return cn(
    'ui-button',
    'ui-button-size-default',
    VARIANT_CLASS[input.variant ?? 'default'],
    input.className,
  )
}

export function Button({
  asChild,
  children,
  className,
  variant = 'default',
  ...props
}: ButtonProps) {
  const resolvedClassName = buttonClassName({ className, variant })
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
