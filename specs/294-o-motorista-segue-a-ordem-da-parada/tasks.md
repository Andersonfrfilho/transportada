# Tasks — 294 O motorista segue a ordem da parada

Uma task por vez. Cada task fecha com typecheck + testes do app + commit isolado, evidência em `evidence.md`.
Teste que mexe em `test/integration/**` fecha com `bun --env-file=../../.env.test run test:integration`.

## Fase 0 — Decisão e contrato antes do código

> 🤖 Modelo: `sonnet` (T0.1 é 🧠 — `opus`)

- [x] **T0.1 🧠** ADR `0113-o-ponto-da-chegada-corrige-o-endereco.md` (substitui ADR-0080 em parte, revoga
      205 D6 e 206 D6/D8 para o motorista). Conferir número livre em `origin/staging` e confirmar a tabela de
      eventos de parada onde entra `recorded_together`. Aceite: ADR no índice, `grep -n "0113" docs/adr`.
- [x] **T0.2** Contrato `test/trips/stop-event-sequence.contract.ts`: tabela estado × evento × autoria → etapas
      marcadas junto (RF1–RF4, RF7). Vermelho, depois verde com a política pura (mesma task; ver evidence.md).
- [x] **T0.3** Contrato `test/trips/address-arrival-correction.contract.ts`: precisão × distância →
      `apply|suggest|ignore` (RF14, RF15). Vermelho, depois verde com a política pura (mesma task; ver evidence.md).
- [ ] **T0.4** (movida para T4.3) Contratos do bot: oferta da próxima rota (RF8–RF10) e matriz de não interferência (RNF1) com
      ocorrência aberta, entrega em preparo, escolha de parada e oferta. Vermelho. Registrar no `package.json`.

## Fase 1 — Painel tolerante (vai a produção antes da API)

> 🤖 Modelo: `sonnet`

- [x] **T1.1** Linha do tempo aceita `recordedTogether` e o evento "endereço corrigido pelo motorista" sem
      quebrar quando ausentes. Aceite: testes do painel (script `test`).

## Fase 2 — API: ordem dos eventos

> 🤖 Modelo: `sonnet` (T2.2 é 🧠 — validar com `architect` em `opus` antes)

- [x] **T2.1** Migration A aditiva: `recorded_together`, `address_correction_suggestions`. `make migration-test`
      e `db:generate` com `no_changes` depois.
- [x] **T2.2 🧠** Extrair os `perform` de saída e chegada para `stop-event-steps.service.ts` **sem mudar
      comportamento**. Aceite: contrato + integração inteiros verdes, diff só de movimentação.
- [x] **T2.3** `stop-event-sequence.policy.ts` (T0.2 verde) e uso em chegada e baixa do motorista; resultado com
      `recordedTogether`. Integração: 3 eventos em 1 transação, escritório 1, reenvio não duplica.
- [x] **T2.4** Estatísticas (tempo de serviço, permanência, deslocamento, previsão 109) ignoram
      `recorded_together`. Aceite: integração.
- [x] **T2.5** Baixa que fecha a parada devolve `nextStop`; snapshot do motorista leva `precision`.

## Fase 3 — API: endereço pela chegada

> 🤖 Modelo: `sonnet`

- [x] **T3.1** `address-arrival-correction.policy.ts` (T0.3 verde) + aplicação com `origin: 'driver'` +
      sugestão. Evento na linha do tempo (RF16).
- [x] **T3.2** `GET /pending-items` com sugestões; aplicar/descartar com `settings.manage` (conferir a permissão
      do PATCH atual de endereço e usar a mesma). Contrato negativo de tenant.
- [ ] **T3.3** RF27 na API: `outOfOrder` + `confirmOutOfOrder` nas rotas da tripulação (saída, chegada, baixa) e hash
      do canhoto antes de anexar, em qualquer canal. Contratos e integração; escritório não recebe `outOfOrder`.

## Fase 4 — Bot

> 🤖 Modelo: `sonnet` (T4.1 → `haiku`)

- [ ] **T4.1** (`haiku`) RF17: cliente nas listas de escolha e nos resumos; remover a proibição dos cabeçalhos de
      `whatsapp-group-*-flow.service.ts` e `whatsapp-driver-stop.policy.ts`. Aceite: contratos do WhatsApp.
- [ ] **T4.2** Linha "marquei junto" nas respostas de saí/cheguei/entreguei/devolvi (RF5).
- [ ] **T4.3** Fluxo da próxima rota (grupo e individual), com abertura condicionada (RNF1). T0.4 verde.
- [ ] **T4.4** "Cheguei" em parada não confiável pede a localização e chama a correção.
- [ ] **T4.5** RF18–RF20: identificar quem mandou (tripulação × atendente × nenhum) no grupo e no individual; baixa do
      atendente pelo caminho do escritório (`target`, autoria `office`, ator = usuário do atendente) com provas opcionais;
      corrigir a entrega em preparo do grupo que grava em nome do motorista. Contratos: atendente pula etapas sem marcar
      junto, tripulação marca junto, desconhecido é recusado.
- [ ] **T4.6** RF21: atendente fecha no grupo e no individual — baixa de várias notas de uma vez e encerrar viagem
      (mesmas funções do painel, `POST /trips/:id/close`), com confirmação. Contratos nos dois canais; tripulação
      continua uma nota por vez.
- [ ] **T4.7** RF22: contratos de áudio para cada passo novo (próxima rota, marquei junto, escolha de parada/nota,
      quem recebeu, pular, encerrar rota, atendente) no grupo e no individual; mídia pedida + áudio repete o pedido.
- [ ] **T4.8a 🧠** Spike (`opus`): como saber se a foto é um canhoto assinado — comparar OCR local no worker (marcas
      "Recebemos de", "Data de recebimento", "Assinatura") × modelo de visão; custo por foto, tempo, acerto num lote real
      de fotos de staging; decisão registrada no ADR 0113 ou ADR novo. Sem decisão, a T4.8 não começa.
- [ ] **T4.8** RF23: foto sem "entreguei" → confere se é canhoto (T4.8a) → leitura do canhoto (worker `canhoto-read`) → pede localização;
      casou → entrega em preparo com o canhoto e baixa; não casou → pergunta a nota. Contratos: casou, várias fotos,
      ilegível, nota de outra viagem, atendente.
- [ ] **T4.9** RF24: "Iniciar rota" e "Cheguei" pelo bot pedem localização opcional (pular falado vale; usa a
      compartilhada antes sem perguntar).
- [ ] **T4.10** RF25: conferência de fora de ordem (canhoto/entreguei de outra parada; iniciar rota que não é a
      próxima), com 1/2 também por áudio; atendente sem pergunta.
- [ ] **T4.11** RF26: canhoto repetido (mesma imagem, nota já com canhoto → trocar/descartar, nota sem canhoto →
      completa).

## Fase 5 — App do motorista

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Confirmação "Vamos marcar Cheguei junto" e aviso pós-baixa; "Registrar entrega depois" com
      etapas marcadas junto e placar como hoje.
- [ ] **T5.2** Card da próxima parada com "Iniciar rota" e aviso de endereço não confiável; localização no
      "Cheguei" de parada não confiável.
- [ ] **T5.3** Fila offline: "Cheguei" recusado/descartado não gera baixa sem chegada (RNF3).
- [ ] **T5.4** RF27 no app: diálogo de fora de ordem (canhoto/entreguei de outra parada, iniciar rota fora da
      sequência), aviso de canhoto repetido e conferência "é canhoto?" na foto do canhoto.

## Fase 6 — Painel e fechamento

> 🤖 Modelo: `sonnet` (revisão → `code-reviewer` `sonnet`)

- [ ] **T6.1** `/pendencias` com sugestão de endereço (mapa atual × sugerido), aplicar/descartar.
- [ ] **T6.2** `make check`, integração da API, smoke; atualizar `apps/api-transportada/CLAUDE.md`,
      `docs/ai-context/` e o `CLAUDE.md` da raiz (§14 do code-standart).
- [ ] **T6.3** Revisão final e publicação em etapas: painel tolerante → API (com migration A) → bot e app.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/294-o-motorista-segue-a-ordem-da-parada/ (leia spec.md, plan.md
e tasks.md antes de começar), no worktree ../transportada-wt/spec-294. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet, T0.1 🧠 → opus · Fase 1 → executor model=sonnet ·
Fase 2 → executor model=sonnet, T2.2 🧠 → validar com architect model=opus antes de implementar ·
Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet (T4.1 → haiku) · Fase 5 → executor model=sonnet ·
Fase 6 → executor model=sonnet · revisão final → code-reviewer model=sonnet.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Cada task fecha com typecheck + testes do app (script test; integração da API com --env-file) + commit isolado,
evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, publicar em staging/main, qualquer [NEEDS CLARIFICATION].
```
