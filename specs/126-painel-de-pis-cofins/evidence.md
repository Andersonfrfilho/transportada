# Evidência — 126

## T1 — contrato da API antes do código

`api-transportada/test/companies/federal-tax-settings.contract.ts`, 10 testes, registrado em
`test/companies.contract.test.ts`. Antes da implementação:

```
error: Cannot find module '../../src/companies/application/federal-tax-settings.use-case.js'
 0 pass · 1 fail
```

Depois: `bun run test` da API → **4964 pass · 0 fail**; `bunx tsc --noEmit` → exit 0; eslint limpo.

## T4 — frontend

`frontend-transportada/test/company-settings/federal-tax-panel.contract.ts` (11 testes): regimes são
cópia por valor da API (lida do fonte); o CRT estreita os regimes; a sugestão é a da lei; Simples
nasce preenchido e marcado; escolher sugere e digitar apaga a marca; o gravado abre como gravado, em
percentual; `0,65` vira `0.006500` e nunca `0.65`; o guard aceita declaração ou ausência; o painel
usa `Select` e `Skeleton` do DS, sem `<select>` nem `title`; a página hospeda o painel só na aba
`taxes`; os dois idiomas nomeiam o painel. `tabs.contract.ts` cobra o registro sem alteração.

⚠️ O contrato do frontend foi escrito na mesma leva do código — não houve rodada vermelha isolada
dele. O da API, sim.

```
bun run test (frontend) → 3296 pass · 0 fail
```

## T5 — medição nas viagens reais

Base local, 2026-09-10, 32 viagens. `company_tax_settings` está **vazia** nesta base, e a medição
não grava nada nela (o banco é o mesmo que o checkout principal usa). O "depois" injeta as alíquotas
do Lucro Presumido (PIS 0,65%, COFINS 3%) **em memória** no contexto lido.

| medida                                | sem cadastro (hoje)      | com Presumido declarado |
| ------------------------------------- | ------------------------ | ----------------------- |
| Parcela `pis_cofins`                  | 32 × `NO_FEDERAL_REGIME` | 32 × valor, `estimated` |
| PIS/COFINS somado nas 32 viagens      | —                        | **R$ 3.821,98**         |
| Maior (`5fc120c7`, receita 15.034,85) | —                        | R$ 548,77 (3,65%)       |

`estimated` e não `measured` porque nenhuma nota destas viagens tem CT-e autorizado: a base é a
receita prevista pela regra de frete (regra 6).

## T6 — gate

Ver o `make check` final, registrado no relatório da entrega e no commit.
