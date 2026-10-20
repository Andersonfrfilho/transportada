# Feature 277 — A lista de ocorrências tem busca rápida

Pedido do dono (Anderson, 20/10/2026), com preview interativo aprovado antes da implementação
(https://claude.ai/artifact/GQEbHcUFEeL82U9tdo4oZP). Estende a 183 (lista), 266 (andamento) e usa os
tempos da 276 (etapa 3) para a resolução média.

## Problema e resultado

A lista de `/ocorrencias` abre com o painel de filtros inteiro à frente e não tem busca livre: achar uma nota, um motorista ou
um veículo exige abrir o campo certo. Resultado: **um campo de busca** que procura em vários campos; a lista abre **agrupada
por andamento** com os filtros avançados recolhidos; a linha mostra o que o escritório precisa para agir sem abrir a ocorrência
(veículo, contratante, cliente, cidade de entrega, valor, peso e volumes) com botões de copiar; linhas zebradas;
resolução média por tipo.

## Fora do escopo

Busca por texto da conversa ou da observação; ordenar por relevância; mudar a paginação por cursor.

## Requisitos funcionais

- **RF1** `GET /v1/trip-occurrences?search=…` (2 a 80 caracteres após `trim`; fora disso 400) filtra, em AND com os demais
  filtros, as ocorrências em que **qualquer** campo casa, sem diferenciar maiúscula/minúscula: número da nota, nome do motorista,
  placa, marca, modelo, ano e cor do veículo, nome do tipo (ou `kind` da parada), nome e CNPJ do contratante (emitente) e do cliente
  (destinatário), cidade de entrega e o andamento (Em aberto, Reaberta, Resolvida, Cancelada). CNPJ casa só por dígitos.
- **RF2** O item da lista ganha `vehicle` (`brand`, `model`, `modelYear`, `color`) e, no `document`, `recipient` (`name`,
  `taxId`) e `cargo` (`grossWeightKg`, `volumeCount`, strings decimais). Campos aditivos: painel anterior ignora.
- **RF3** Painel: campo de busca com debounce; chips de andamento com contagem que ligam/desligam o filtro `resolutionStateIn`;
  filtros avançados atrás de um botão com `CountBadge`; lista agrupada por andamento; colunas novas no menu "Colunas".
- **RF4** Botões de copiar (`CopyButton`) em nota, placa e CNPJs. Tabelas zebradas.
- **RF5** Painel "Resolução média por tipo": mesmo dado da 276 etapa 3 (registro até Resolvida), sem cálculo paralelo.

## Etapas (uma por PR, staging antes de main)

1. API: `search` + `vehicle`, `recipient`, `cargo` no item (aditivo).
2. Painel: busca, agrupamento, colunas, copiar, zebra.
3. Resolução média por tipo (depende da 276 T3).

## Critérios de aceite

- **CA1** `parseTripOccurrenceFeedList` aceita `search`, aparado; menos de 2 ou mais de 80 caracteres → `invalid_request`.
- **CA2** Contra Postgres: `search` por parte do número da nota, nome do motorista, placa, modelo, cor, nome do contratante,
  CNPJ do cliente e cidade devolve a ocorrência; termo que não casa devolve vazio; outra empresa nunca aparece.
- **CA3** O item traz `vehicle`, `recipient` e `cargo` com os valores da nota/veículo.
