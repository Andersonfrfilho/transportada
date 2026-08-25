/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'

import { getLandingApiBaseUrl } from '@/modules/shared/landingEnvironment.config'

const FALLBACK_MARK_SRC = '/icons/icon.svg'

type BrandMarkProps = Readonly<{ className: string | undefined }>

/**
 * A logo da empresa (`GET /public/landing-logo`) some sozinha quando o operador não configurou
 * uma — cai no ícone padrão da plataforma. `onError` cobre tanto o 404 (sem logo) quanto qualquer
 * outra falha de rede, sem distinguir os dois: o efeito visual é o mesmo.
 */
export function BrandMark({ className }: BrandMarkProps): ReactNode {
  const [src, setSrc] = useState(() => `${getLandingApiBaseUrl()}/public/landing-logo`)

  return (
    <img
      alt=""
      className={className}
      src={src}
      onError={() => {
        if (src !== FALLBACK_MARK_SRC) setSrc(FALLBACK_MARK_SRC)
      }}
    />
  )
}
