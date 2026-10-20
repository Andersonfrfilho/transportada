# Evidência — 277

## T1 (etapa 1, API)

- Contrato: `test/trip-occurrence/feed.contract.ts` — `search` aparado; menos de 2 ou mais de 80 caracteres recusa (CA1).
- Integração contra Postgres 16 descartável, `--env-file=../../.env.test`, 10 pass / 0 fail em
  `test/integration/trip-occurrence-feed-document.integration.ts` (CA2, CA3): casa por nota, motorista, placa, marca, modelo,
  ano, cor (`azul marinho` casa o código `azul_marinho`), contratante, CNPJ só por dígitos, cliente, cidade e andamento; `%%`
  é texto; outra empresa não aparece; `vehicle`, `recipient` e `cargo` no item.
- Suíte de contrato da API inteira: 12444 pass, 0 fail.
- Typecheck, eslint e prettier limpos nos arquivos tocados.

## T2 (etapa 2, painel)

- Contrato `test/trip/occurrence-table.contract.ts`: `search` aparado e só com 2+ caracteres, contagem de filtros avançados sem a
  busca e sem os chips, agrupamento por andamento na ordem fixa (andamento desconhecido cai em aberto), veículo/cliente/cidade/carga,
  colunas novas ao fim da preferência gravada, uso de `CopyButton`, `CountBadge` e `useRevealedPanel`.
- Suíte do painel: 8463 pass, 0 fail (inclui `field-metrics`, `locale-accents` e os contratos do design system). Typecheck e eslint limpos.
- Revisão de design contra a própria página (`web.md` §15): `prints/lista-desktop.png`, `prints/filtros-avancados.png` e
  `prints/lista-celular.png`, gerados por `test/spec-277-prints.smoke.spec.ts` (fora do smoke da CI).
- Decisões: peso e volumes saem de `nfe_volumes` (kg e quantidade; a nota não guarda m³); os quatro andamentos abrem ligados, como já
  era o padrão do filtro; a zebra é por classe dentro de cada grupo porque o `nth-child` do `.dataTable` conta o título do grupo.
