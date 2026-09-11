# Evidência — 125

## T1 — contrato antes do código

`api-transportada/test/trip-valuation/icms-projection.contract.ts`, 14 testes, registrado em
`test/trip-valuation.contract.test.ts`. Antes da implementação o arquivo não carregava:
`cte-icms.policy.ts` e `trip-icms-projection.policy.ts` não existiam.

Contas conferidas no contrato (receita de R$ 1.000,00, alíquota 12%):

| CST                | base     | ICMS projetado                  |
| ------------------ | -------- | ------------------------------- |
| `00`               | 1.000,00 | 120,00                          |
| `20` (redução 20%) | 800,00   | 96,00                           |
| `90`               | 1.000,00 | 120,00                          |
| `90` sem alíquota  | —        | 0,00 declarado                  |
| `40`/`41`/`51`     | —        | 0,00 declarado                  |
| `60`               | —        | ausente, `ICMS_CST_UNSUPPORTED` |

E o arredondamento do documento: R$ 333,335 vira base 333,34 (duas casas, meio para cima) e ICMS
40,00.

## T2 — o CT-e não mudou

`composeIcms` passou a mapear `computeIcms`. As suítes do CT-e (`cte-issuance-domain`,
`cte-issuance-application`, payload e builder) rodam dentro de `bun run test` da API sem nenhuma
alteração de expectativa.

## T6 — tela

`frontend-transportada/test/trip-financials/valuation-icms-basis.contract.ts` (3 testes): `basis`
de ICMS lido por forma, `0.120000` → `12.0000`, `0.0065` → `0.6500`, e a frase `ledger.icmsBasis` em
pt e en. O contrato de rótulos cobra `NO_EMISSION_PROFILE` e `ICMS_CST_UNSUPPORTED` nas quatro
tabelas.

## T7 — medição nas viagens reais

Base local, 2026-09-10. Um perfil ativo (`Spani`, casamento pela raiz `05868574` do remetente,
**CST 90 com alíquota 0**), e nenhum CT-e autorizado entre as 328 notas vinculadas a viagens.

| medida                                                | antes (124) | depois                              |
| ----------------------------------------------------- | ----------- | ----------------------------------- |
| Viagens com parcela `icms` ausente                    | 32          | 6                                   |
| Viagens com `icms` projetado (`estimated`)            | 0           | **26**                              |
| Vínculos nota–viagem com ICMS projetado               | 0           | **1308 de 1308**                    |
| Vínculos ausentes por `NO_EMISSION_PROFILE`           | —           | 0                                   |
| Vínculos ausentes por `ICMS_CST_UNSUPPORTED`          | —           | 0                                   |
| Vínculos ausentes por `NO_FREIGHT_RULE` (sem receita) | —           | 0                                   |
| Valor do ICMS projetado                               | —           | 0,00 em todas (CST 90 sem alíquota) |
| Outras parcelas alteradas                             | —           | 0                                   |

As 6 viagens que seguem ausentes **não têm nota nenhuma** vinculada (`8d224efd`, `5bde6604`,
`d89d0dca`, `fdd94b9e`, `07dd9ccc`, `ea181c63`): sem nota não há receita nem base.

O número é zero porque o perfil desta instalação declara CST 90 sem alíquota — o CT-e sairia sem
destaque de ICMS, e a projeção diz exatamente isso, com o CST ao lado. O que mudou para a margem é a
natureza da linha: de "desconhecido" para "0,00 estimado, CST 90". Uma instalação com CST 00 ou 20
passa a ver o imposto real na montagem.

## T8 — gate

```
api-transportada: bun run test → 4954 pass · 0 fail ; bunx tsc --noEmit → exit 0
frontend-transportada: bun run test → 3285 pass · 0 fail ; tsc --noEmit → exit 0
```
