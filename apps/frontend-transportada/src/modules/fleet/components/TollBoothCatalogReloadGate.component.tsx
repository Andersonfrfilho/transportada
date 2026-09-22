/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  TollBoothCatalogReloadPanel,
  type TollBoothCatalogReloadPanelProps,
} from './TollBoothCatalogReloadPanel.component'

/**
 * Spec 154 T303/T402: só quem tem `settings.manage` vê o bloco de recarga (RF6, aceite 4) —
 * extraído de `FleetWorkspace.page.tsx` para o contrato poder afirmar isso sobre o **renderizado**
 * (`renderToStaticMarkup`, T402 item 6), em vez de ler o texto-fonte da página.
 */
export type TollBoothCatalogReloadGateProps = TollBoothCatalogReloadPanelProps &
  Readonly<{ canManageSettings: boolean }>

export function TollBoothCatalogReloadGate({
  canManageSettings,
  ...panelProps
}: TollBoothCatalogReloadGateProps) {
  if (!canManageSettings) return null
  return <TollBoothCatalogReloadPanel {...panelProps} />
}
