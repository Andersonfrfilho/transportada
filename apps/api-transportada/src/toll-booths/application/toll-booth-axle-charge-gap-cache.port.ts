/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503 (revisão final, defeito 2): a contagem de "praças sem tarifa por eixo conhecida"
 * (RF2) não depende de `page` nem de `search` — só do catálogo inteiro e dos ajustes da empresa —
 * mas `list-toll-booth-catalog.use-case.ts` recalculava em toda requisição, lendo `toll_booths`
 * inteira (colunas mínimas) mesmo quando o cliente só virou de página ou digitou uma letra a mais
 * na busca. Este port é a memória por empresa: `read` devolve o valor calculado da última vez (ou
 * `undefined` se nunca calculado ou se algo desde então invalidou), `write` grava depois de
 * calcular, e as duas formas de invalidação acompanham exatamente o que muda o resultado —
 * `invalidate` (uma empresa: ajuste ou remoção de ajuste) e `invalidateAll` (toda empresa: a
 * recarga do catálogo, RF4, que reescreve `toll_booths` para a instalação inteira).
 */
export type TollBoothAxleChargeGapCachePort = Readonly<{
  invalidate(companyId: string): void
  invalidateAll(): void
  read(companyId: string): number | undefined
  write(companyId: string, count: number): void
}>
