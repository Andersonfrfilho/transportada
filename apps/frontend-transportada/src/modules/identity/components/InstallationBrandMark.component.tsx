/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Skeleton } from '@/components/ui/skeleton'

import type { InstallationBrandView } from '../hooks/useInstallationBrandView.hook'

type InstallationBrandMarkProps = Readonly<{
  brand: InstallationBrandView
  logoClassName?: string | undefined
  nameClassName?: string | undefined
}>

/** Logo e nome da transportadora, com a forma do nome enquanto a marca carrega. */
export function InstallationBrandMark({
  brand,
  logoClassName,
  nameClassName,
}: InstallationBrandMarkProps) {
  if (brand.isLoading) {
    return <Skeleton height="1rem" width="var(--space-16)" />
  }

  return (
    <>
      <img alt="" className={logoClassName} onError={brand.handleLogoError} src={brand.logoUrl} />
      <strong className={nameClassName}>{brand.name}</strong>
    </>
  )
}
