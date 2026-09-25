/* Cópia por valor de apps/frontend-transportada/src/modules/identity/hooks/useInstallationBrandView.hook.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { useInstallationBrand } from '../queries/useInstallationBrand.query'

/** A marca do produto: só enquanto a da transportadora não chegou, ou quando ela não existe. */
export const PRODUCT_BRAND_NAME = 'TransportAdA'
export const PRODUCT_BRAND_LOGO_URL = '/icons/icon.svg'

export type InstallationBrandView = Readonly<{
  handleLogoError: () => void
  isLoading: boolean
  logoUrl: string
  name: string
}>

/**
 * O menu lateral e o cabeçalho tinham "TransportAdA" e o ícone do produto escritos no código: o
 * login mostrava a transportadora e, ao entrar, ela sumia. Toda marca de tela passa por aqui.
 */
export function useInstallationBrandView(): InstallationBrandView {
  const brand = useInstallationBrand()
  /** Instalação sem logotipo responde 404: o ícone do produto assume, sem imagem quebrada. */
  const [hasLogo, setHasLogo] = useState(true)
  const company = brand.data

  return {
    handleLogoError: () => setHasLogo(false),
    isLoading: brand.isLoading,
    logoUrl: company !== undefined && hasLogo ? company.logoUrl : PRODUCT_BRAND_LOGO_URL,
    name: company?.name ?? PRODUCT_BRAND_NAME,
  }
}

/** O título da aba é o que se lê antes de tudo, com várias abas abertas: nome da transportadora. */
export function useInstallationDocumentTitle(name: string): void {
  useEffect(() => {
    document.title = name
  }, [name])
}
