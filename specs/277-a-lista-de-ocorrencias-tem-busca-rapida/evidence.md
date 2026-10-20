# Evidência — 277

## T1 (etapa 1, API)

- Contrato: `test/trip-occurrence/feed.contract.ts` — `search` aparado; menos de 2 ou mais de 80 caracteres recusa (CA1).
- Integração contra Postgres 16 descartável, `--env-file=../../.env.test`, 10 pass / 0 fail em
  `test/integration/trip-occurrence-feed-document.integration.ts` (CA2, CA3): casa por nota, motorista, placa, marca, modelo,
  ano, cor (`azul marinho` casa o código `azul_marinho`), contratante, CNPJ só por dígitos, cliente, cidade e andamento; `%%`
  é texto; outra empresa não aparece; `vehicle`, `recipient` e `cargo` no item.
- Suíte de contrato da API inteira: 12444 pass, 0 fail.
- Typecheck, eslint e prettier limpos nos arquivos tocados.
