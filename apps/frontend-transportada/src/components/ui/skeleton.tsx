/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/lib/utils'

import styles from './skeleton.module.css'

type SkeletonVariant = 'text' | 'block' | 'circle'

export type SkeletonProps = Readonly<{
  variant?: SkeletonVariant
  width?: string | undefined
  height?: string | undefined
  className?: string | undefined
}>

type SkeletonStyle = CSSProperties & {
  '--skeleton-width'?: string | undefined
  '--skeleton-height'?: string | undefined
}

export function Skeleton({ className, height, variant = 'block', width }: SkeletonProps) {
  const style: SkeletonStyle = {
    '--skeleton-height': height,
    '--skeleton-width': width,
  }

  return (
    <span
      aria-hidden="true"
      className={cn(styles.skeleton, styles[variant], className)}
      style={style}
    />
  )
}

type SkeletonGroupProps = Readonly<{
  children: ReactNode
  label: string
  className?: string | undefined
}>

// Agrupa as barras individuais (decorativas, aria-hidden) sob um único anúncio de carregamento.
export function SkeletonGroup({ children, className, label }: SkeletonGroupProps) {
  return (
    <div aria-busy="true" aria-label={label} className={className} role="status">
      {children}
    </div>
  )
}
