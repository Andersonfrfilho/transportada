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

## T3 (etapa 3, resolução média por tipo)

- API: `GET /v1/trip-occurrence-resolution-summary` (`fleet.read`, como o feed) devolve, por tipo, `{ typeName, resolvedCount,
  averageSeconds }`: do registro até o **último** `resolved` (o `resolvedAt` da 276), só de quem está resolvida agora — reaberta,
  em aberto e cancelada ficam de fora; nome do tipo como no feed. Fora de `/trip-occurrences/` porque o `:id` do detalhe casaria o
  caminho (contrato de colisão da 266).
- Integração contra Postgres 16 descartável: `test/integration/trip-occurrence-resolution-summary.integration.ts`, 3 pass / 0 fail
  (média por tipo nas duas fontes, reaberta e cancelada fora, resolvida de novo conta pelo último `resolved`, outra empresa não aparece).
- Contratos de rota: `separator-role` e `finance-read` listam a rota nova; colisão de rotas da 266 verde. Typecheck e eslint limpos.
- Painel: `test/trip/occurrence-resolution-summary.contract.ts` (leitura tolerante, formatação "2 h 05 min", "menos de 1 min",
  "Resolveu em" só para a resolvida); suíte do painel 1407 pass / 0 fail no script `test`. O painel some sozinho se a leitura falha
  (API anterior à rota) ou se nada foi resolvido; resolver ou a tratativa terminal invalidam a média.
- Revisão de design: `prints/lista-desktop.png` (cartões da média acima da tabela; a coluna "Resolveu em" fica à direita, depois de
  Peso / volume, e entra pelo menu Colunas como as outras).
