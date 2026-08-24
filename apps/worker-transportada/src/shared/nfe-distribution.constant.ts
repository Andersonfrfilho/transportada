/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A distribuição de NF-e assina com o certificado de **CT-e** — não há certificado de propósito
 * próprio para ela. O valor mora aqui, e não dentro de cada módulo, porque quem **pré-filtra** a
 * empresa (`nfe-distribution-pull`) e quem **abre o envelope** para chamar a SEFAZ
 * (`nfe-distribution`) têm de olhar a mesma linha de `digital_certificates`: com dois propósitos
 * ativos por empresa (`cte` e `mdfe`), discordar aqui é aprovar a empresa pelo certificado de MDF-e
 * e falhar na hora de assinar — ou recusá-la por um vencimento que a distribuição nunca usaria.
 */
export const NFE_DISTRIBUTION_CERTIFICATE_PURPOSE = 'cte' as const
