/** Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  PRODUCT_BRAND_LOGO_URL,
  PRODUCT_BRAND_NAME,
} from '@/modules/identity/hooks/useInstallationBrandView.hook'

import { readLetterheadCompany, type LetterheadCompany } from './spreadsheetLetterhead.service'
import { loadSpreadsheetLogo, type SpreadsheetLogo } from './spreadsheetLogo.service'

const COMPANY_LOGO_PATH = '/public/landing-logo'

export type SpreadsheetLetterheadData = Readonly<{
  company: LetterheadCompany
  logo: SpreadsheetLogo | undefined
  userName: string
}>

/**
 * O timbre das planilhas, lido **no clique de exportar** — nunca ao abrir a tela: são duas rotas
 * públicas e uma imagem que ninguém pediu até ali. O logo é o da empresa; sem ele (a rota responde
 * 404 numa instalação nova), o do produto assume.
 */
export function useSpreadsheetLetterhead(): Readonly<{
  load: () => Promise<SpreadsheetLetterheadData>
}> {
  return {
    async load(): Promise<SpreadsheetLetterheadData> {
      const apiUrl = getIdentityEnvironment().apiBaseUrl
      const fetchFromBrowser = globalThis.fetch.bind(globalThis)
      const [company, companyLogo] = await Promise.all([
        readLetterheadCompany({
          apiUrl,
          fallbackName: PRODUCT_BRAND_NAME,
          fetch: fetchFromBrowser,
        }),
        loadSpreadsheetLogo({ fetch: fetchFromBrowser, url: `${apiUrl}${COMPANY_LOGO_PATH}` }),
      ])
      const logo =
        companyLogo ??
        (await loadSpreadsheetLogo({ fetch: fetchFromBrowser, url: PRODUCT_BRAND_LOGO_URL }))

      return { company, logo, userName: getKeycloakAuthProvider().getProfile().displayName }
    },
  }
}
