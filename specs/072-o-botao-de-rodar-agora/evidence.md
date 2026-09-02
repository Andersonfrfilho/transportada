# Evidências

## Spec 072 — 2026-09-02

O schema **já tinha projetado o botão** e faltava o botão: `job_executions.requested_by`, o CHECK que
o exige quando `origin = 'manual'`, e o índice `job_executions_open_unique`, cujo comentário diz que
ele "sustenta o `409` do botão". Esta feature construiu o que já estava desenhado.

### O que ficou

- **`operations.run`**, permissão própria, só no `admin`. Disparar gasta cota de terceiro
  (`geocoding.backfill` fala com a BrasilAPI, `fuel.price.pull` com a ANP) e não sai de carona com
  `operations.read`.
- **`POST /operations/jobs/:job/run`** → `202` com o `executionId`, `409` `JOB_ALREADY_RUNNING`,
  `400` para rotina fora do catálogo, `403` sem a permissão.
- O `409` é decidido pelo **índice**, num `on conflict do nothing` — nunca por `select` seguido de
  `if`, porque entre os dois cabe outra escrita e dois cliques no mesmo segundo criariam duas
  execuções.
- **Falha ao publicar devolve a linha.** Execução aberta sem mensagem trava a rotina até a varredura
  de abandono, e nesse meio-tempo o botão responde `409` sem ninguém entender por quê. `release`
  **apaga** em vez de fechar: a linha nunca rodou, e marcá-la encerrada poria no painel uma execução
  que não existiu.
- **Terceira cópia por valor** da topologia de `job-run` (cron publica pela batida, API pelo botão,
  worker consome), com contrato comparando contra o arquivo do **worker** — é ele quem consome, e é
  o nome dele que manda.

### ⚠️ Um defeito da spec 069 encontrado no caminho

`createApplicationRoutes` recebe `environment: Record<string, string | undefined>` — o registro
**cru** do processo. Eu tinha escrito `environment.googleMapsApiKey`, que **compila** (o `Record`
aceita qualquer nome) e vale `undefined` para sempre: a chave crua é `GOOGLE_MAPS_API_KEY`.

O efeito seria silencioso e caro: o gateway pago nunca seria construído, e a marca responderia
"precisão fina não disponível" **mesmo com a chave configurada no Railway** — exatamente o cenário
que acabáramos de montar. Nenhum teste pegaria, porque o tipo permissivo aceita o erro.

A correção passa `googleMapsApiKey` e `messaging` como **parâmetros tipados**, não pelo registro cru.

**Verificação:** `make check` exit 0 — API 3852, frontend 2233, worker 868, cron 94, e as demais, 0
fail em todas.
