/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Skeleton } from '@/components/ui/skeleton'
import { resolveThemedLogoUrl } from '@/modules/shared/colorTheme.service'
import { useEffectiveColorTheme } from '@/modules/shared/useEffectiveColorTheme.hook'

import type { InstallationBrandView } from '../hooks/useInstallationBrandView.hook'

type InstallationBrandMarkProps = Readonly<{
  brand: InstallationBrandView
  logoClassName?: string | undefined
  nameClassName?: string | undefined
  /** Em tela que segue o tema, o logo vira branco sobre fundo escuro. Papel e PDF ficam com o original. */
  themed?: boolean | undefined
}>

/** Logo e nome da transportadora, com a forma do nome enquanto a marca carrega. */
export function InstallationBrandMark({
  brand,
  logoClassName,
  nameClassName,
  themed = false,
}: InstallationBrandMarkProps) {
  const theme = useEffectiveColorTheme()
  if (brand.isLoading) {
    return <Skeleton height="1rem" width="var(--space-16)" />
  }

  return (
    <>
      <img
        alt=""
        className={logoClassName}
        onError={brand.handleLogoError}
        src={
          themed && brand.hasCompanyLogo
            ? resolveThemedLogoUrl({ logoUrl: brand.logoUrl, theme })
            : brand.logoUrl
        }
      />
      <strong className={nameClassName} title={brand.name}>
        {brand.name}
      </strong>
    </>
  )
}
