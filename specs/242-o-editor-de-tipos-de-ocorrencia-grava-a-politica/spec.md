# Spec 242 — O editor de tipos de ocorrência grava a política de reentrega

## Problema

`PUT /company-settings/occurrence-types` responde 400 `INVALID_REQUEST` ("Unrecognized key:
`redeliveryPolicy`") a toda gravação do painel: o schema Zod é `.strict()` e não conhece o campo, que
o painel manda sempre. Abrir só o schema não basta: `saveOccurrenceType` grava
`redeliveryPolicy ?? 'unset'` tanto no INSERT quanto no UPDATE, e uma regravação sem o campo zeraria
a política. E `listOccurrenceTypes` não seleciona a coluna, então a tela mostra sempre "Indefinido".

A decisão já está tomada na spec 164 (RF1 e T21). A metade da API nunca foi implementada. Esta spec só a
cumpre.

## Requisitos funcionais

- RF1: `PUT` aceita `redeliveryPolicy` opcional (`unset | allowed | blocked`), sem `default`.
- RF2: `PUT` com o campo ausente **não altera** o valor guardado; na criação vale o padrão da coluna.
- RF3: `GET` devolve `redeliveryPolicy` em cada tipo.
- RF4: valor fora do vocabulário e chave desconhecida continuam 400.

## Critérios de aceite

- CA1: contrato de schema (`redelivery-policy-schema.contract.ts`) e rota PUT com o corpo do painel.
- CA2: integração contra Postgres: cria com `allowed`, regrava sem o campo e segue `allowed`, regrava
  com `blocked` e vira `blocked`; o `GET` devolve o campo.
- CA3: o painel segue compatível com o campo novo na resposta.

## Fora do escopo

Qualquer regra nova sobre a política (semântica, tratativa, UI). Migration (a coluna já existe).

## Referência

`specs/164-destino-da-nota-na-ocorrencia/spec.md` RF1 e `tasks.md` T21.
