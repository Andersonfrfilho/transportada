# Spec 137 — O banco falha rápido, e diz por quê

## Incidente (11/09/2026, API local em `bun --watch`, Bun 1.3.14)

Por volta das 19:03Z a API parou de atender tudo que usa banco: `/health/ready` e qualquer rota
autenticada ficavam ~10 s pendurados e o servidor fechava a conexão **sem resposta** (`Empty reply
from server`, `net::ERR_EMPTY_RESPONSE`) e **sem nenhuma linha de log**. `/health/live` respondia em
7 ms e token inválido dava 401 na hora (recusado antes do banco). O Postgres estava saudável: 39/100
conexões, nenhuma ativa nem `idle in transaction`; o processo da API segurava 7 conexões ociosas.
Antes da falha, a tela de montagem disparou várias `POST /trips/cargo-preview` e
`POST /trips/valuation-preview` concorrentes, e o navegador cancelou parte delas.

## Causa medida

1. **Consultas que nunca terminam, dentro do Bun SQL.** `readCargoPreviewContext` dispara em paralelo
   as consultas de `loadTripOccupancy` (a junção `nfe_products` × `nfe_package_boxes` e a leitura das
   caixas medidas). Com as **instruções preparadas** do Bun SQL (`prepare: true`, o padrão), 35
   chamadas concorrentes deixaram consultas **sem resolver para sempre** — 3 de 3 rodadas —, com o
   Postgres vendo as conexões ociosas. Com `prepare: false`, 15 de 15 rodadas terminaram, até 150
   concorrentes. As outras três leituras da prévia, sozinhas, nunca penduraram; Bun SQL cru com 150
   consultas concorrentes de 2000 linhas também não. Numa rodada a 30 prévias completas o pool inteiro
   travou (`healthCheck` sem resposta para sempre, 8 conexões ociosas no servidor), precedido por
   `ERR_POSTGRES_INVALID_MESSAGE: Failed to read data`.
2. **Nada limitava a espera.** O Bun SQL não tem prazo de espera por conexão (`idleTimeout: 0` no
   padrão) nem de consulta, e o `createDrizzleProvider` não expõe nenhum dos dois. O pedido esperava
   até os **10 s de `REQUEST_TIMEOUT_SECONDS`** (`server.timeout`), que fecha o socket sem resposta —
   e o `handleRequest` nunca chega a logar, porque a promessa não resolve. Os 10 s do incidente são
   esses; `IDLE_TIMEOUT_SECONDS = 60` só vale para o stream SSE.
3. **Os cancelamentos do navegador não foram a causa.** O handler nunca observava o aborto, então ele
   não soltava nem prendia nada: só somava carga. A concorrência sozinha (sem CPU, sem aborto)
   reproduz.

O defeito é do **Bun SQL 1.3.14** (instruções preparadas sob concorrência), não do
`@adatechnology/drizzle-provider` — mas o provider repassa os padrões do Bun sem deixar ninguém
configurá-los (ver "Proposta para o pacote").

## Requisitos

- R1 — O pool tem tamanho e prazos explícitos, por env validado no schema de config, com padrão.
- R2 — Consulta (incluindo a espera por conexão) que passa do prazo vira **503
  `DATABASE_UNAVAILABLE`** no envelope de erro padrão, antes dos 10 s do socket, com log `error`
  estruturado (`database_unavailable`, `correlationId`, `reason`) sem PII.
- R3 — `/health/ready` responde 503 dentro de uma janela curta quando uma dependência não responde;
  nunca pendura.
- R4 — Pedido abortado não prende conexão: quem espera é solto, a consulta que ainda não saiu é
  cancelada, e a que já saiu é limitada pelo `statement_timeout`.
- R5 — A causa sai: `prepare: false`.

## Fora de escopo

- Corrigir o Bun SQL. Registrar e reavaliar `prepare` quando o Bun corrigir.
- Processo que morre por `ERR_POSTGRES_CONNECTION_CLOSED` não tratado quando o servidor derruba uma
  conexão ociosa (medido no Bun SQL cru, ver evidência). Não foi o incidente — o processo ficou vivo.

## Proposta para o pacote (`~/Documents/personal/adatechnology-packages`, `drizzle-provider`)

`createDrizzleProvider` aceita `connection` como objeto do Bun, então `max` e `prepare` já passam;
o que falta é **prazo**. Proposta: aceitar `queryTimeoutMs` e aplicar o guarda desta spec (prazo por
consulta no cliente + `statement_timeout` no servidor), com `prepare: false` como padrão enquanto a
1.3.x tiver o defeito. Aí `database-client.service.ts` volta a ser uma chamada ao pacote.
