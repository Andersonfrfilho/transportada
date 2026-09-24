# Tasks — 164

`[P]` = pode rodar em paralelo sem editar os mesmos arquivos. Task só fecha com evidência de teste em
`evidence.md` (que nasce com a primeira task verificada). Teste de contrato/aceite **antes** da
implementação. Teste novo entra na lista explícita do `package.json` da app.

## Fase 0 — Destravar

> 🤖 Modelo: `opus` (decisão) · a T002 é do usuário

- [ ] **T001** Fechar as três `[NEEDS CLARIFICATION]` do `spec.md` e passar a ADR-0071 para
      `aceito`. Evidência: `spec.md` sem marcador e a ADR com status e data.
- [ ] **T002** 🙋 O usuário submete à Meta os modelos de WhatsApp da contratante (abertura de
      ocorrência; pedido de aprovação de taxa com botões "✅ Aprovar" / "❌ Recusar") e do motorista
      (aviso de mensagem nova). **Pare e pergunte** — é conta da empresa na Meta. Evidência: nomes e
      estado dos modelos no `evidence.md`.
- [ ] **T003** Anotar no `specs/143-a-contratante-responde-por-e-mail/tasks.md` que T014, T015,
      T016, T018, T024 e T025 seguem pela 164 (sem apagar nada da 143). Evidência: o diff.

## Fase 1 — Pacote (`adatechnology-packages`, ADR-0071)

> 🤖 Modelo: `sonnet` · executada no repositório do pacote; aqui só entra o bump de versão

- [ ] **T101** `conversations-ui`: abas por participante, selo de canal, seletor de canal com estado
      da janela, respostas rápidas, anexos e selo de status, na camada `.cv-*`. Evidência: testes do
      pacote e versão publicada.
- [ ] **T102** [P] `meta-whatsapp-provider.sendMedia` (documento, imagem). Evidência: testes do
      pacote e versão publicada.
- [ ] **T103** [P] `meta-whatsapp-module`: eventos de status (`sent`/`delivered`/`read`/`failed`)
      repassados ao produto com o id da mensagem; `meta-whatsapp-contracts`: política da janela de
      24h. Evidência: testes do pacote e versão publicada.
- [ ] **T104** Bump das versões nas apps e `bun install --frozen-lockfile` verde. Evidência:
      `make check`.

## Fase 2 — O detalhe e a tabela (P1, P2) — não depende da Fase 1

> 🤖 Modelo: `sonnet`

- [ ] **T201** Contrato de `GET /trip-occurrences/:id` para os dois tipos, com tenant (404 de outra
      empresa) e com/sem `fleet.read` (chaves do motorista ausentes). Evidência: contrato vermelho.
- [ ] **T202** `get-trip-occurrence.use-case.ts` + query + rota até o T201 ficar verde. Evidência:
      contratos + integração com os dois tipos.
- [ ] **T203** Campos novos na listagem (RF2–RF4) numa consulta só, valor como string decimal.
      Evidência: integração conferindo o número de consultas e o formato.
- [ ] **T204** Rota `/ocorrencias/:id` no frontend (parse/build/navigate), linha clicável e
      `TripOccurrenceDetail.page.tsx` sem a conversa (resumo, nota, motorista com foto/iniciais,
      contato, fotos, linha do tempo). Evidência: contratos de serviço puro da rota e do mapeamento.
- [ ] **T205** Colunas Contratante, Endereço de entrega, Valor NF-e e Conversa na tabela, no menu de
      colunas e na persistência. Evidência: a da `docs/frontend/data-tables.md` § 6.

## Fase 3 — Contatos com tipos e canais (P3)

> 🤖 Modelo: `sonnet` · T301 é 🧠 (migration) — revisar com `architect` em `opus`

- [ ] **T301** 🧠 Migration aditiva de `contractor_contacts` (RF5) com preenchimento e `rollback.sql`.
      Evidência: `make migration-test`.
- [ ] **T302** Política tipos → `receives_occurrences`/`can_decide` e contrato das rotas de contato
      com os campos novos e o aceite (autor e data do servidor). Evidência: política + contratos.
- [ ] **T303** `ContractorContactsPanel` com nome, setor, telefone, tipos, grupos, canais e canal
      preferido. Evidência: contrato de validação.

## Fase 4 — Conversa com a contratante por e-mail (P4) — absorve 143 T014–T016, T018

> 🤖 Modelo: `sonnet` · T401 é 🧠 (migration)

- [ ] **T401** 🧠 Migration das tabelas `occurrence_conversation*` (plan § Dados) com `rollback.sql`.
      Evidência: `make migration-test` + contrato de tenant do schema.
- [ ] **T402** Política de status (RF14) por tabela. Evidência: suíte da política.
- [ ] **T403** Gateway de e-mail do módulo novo sobre os casos de uso da 143 (a 143 T014/T015 entram
      aqui): enviar, responder, prévia pelo mesmo template. Evidência: teste de caso de uso.
- [ ] **T404** Rotas de conversa (listar, enviar, marcar lida, prévia) com tenant, permissão e o
      separador. Evidência: contratos de rota.
- [ ] **T405** Recebida por e-mail vira mensagem da conversa; status do Resend aplicado pela
      política. Evidência: integração no worker.
- [ ] **T406** Aba Contratante (canal e-mail) sobre o `conversations-ui` e o diálogo "Enviar à
      contratante" com prévia. Evidência: contratos de serviço puro + smoke do envio.

## Fase 5 — Conversa com a contratante por WhatsApp (P5)

> 🤖 Modelo: `sonnet` · T502 e T504 são 🧠 (segurança do webhook e decisão)

- [ ] **T501** Políticas de atribuição (RF9) e de decisão por botão (D4). Evidência: suítes por
      tabela.
- [ ] **T502** 🧠 Webhook: ramo "contato de contratante com aceite" (D6), status da Meta e
      recebidas com mídia. Evidência: contratos (número sem aceite segue recusado) + integração do
      status até `read`, idempotente.
- [ ] **T503** Envio por WhatsApp no worker: modelo fora da janela, texto e mídia dentro.
      Evidência: teste de caso de uso com o provider falso.
- [ ] **T504** 🧠 Botão "Aprovar/Recusar" decide a taxa pela transição da 143 (a 143 T020 é
      pré-requisito). Evidência: integração até `approved` + corrida com o e-mail (uma vence).
- [ ] **T505** Fila de não atribuídas (rota + tela simples). Evidência: contratos.
- [ ] **T506** Canal WhatsApp na aba Contratante e no diálogo (E-mail / WhatsApp / Os dois).
      Evidência: contratos de serviço puro.

## Fase 6 — Conversa com o motorista (P6)

> 🤖 Modelo: `sonnet`

- [ ] **T601** Rotas `/me/trips/current/occurrences/:id/messages` (listar, responder com foto) e o
      aviso na inbox com `dedupeKey`. Evidência: contratos (motorista de outra viagem não alcança).
- [ ] **T602** Canal WhatsApp do motorista pelo telefone verificado (ADR-0063). Evidência: teste de
      caso de uso.
- [ ] **T603** Aba Motorista no detalhe, com "Anexar à ocorrência" e "Encaminhar à contratante".
      Evidência: contratos de serviço puro.
- [ ] **T604** Tela da conversa no PWA do motorista, com status `delivered`/`read` gravados ao
      baixar/abrir. Evidência: contrato de serviço + smoke.

## Fase 7 — Respostas rápidas, anexos e status (P6b, P7)

> 🤖 Modelo: `haiku` (T701) · `sonnet` (T702, T703)

- [ ] **T701** [P] `company_quick_replies` + rotas `settings.manage` + tela em Configurações.
      Evidência: contratos.
- [ ] **T702** Anexos: upload, conferência de tipo pelo conteúdo, limite por canal, URL temporária;
      extração das recebidas no worker. Evidência: contratos + integração.
- [ ] **T703** Selo de status na UI com os horários, destaque de falha e "Reenviar por outro canal".
      Evidência: contrato de mapeamento status → selo (e-mail nunca mostra "lida").

## Fase 8 — PWA e fumaça

> 🤖 Modelo: `sonnet`

- [ ] **T801** Lista em cartões e detalhe em abas abaixo de 768 px, alvos de toque ≥
      `--touch-target`. Evidência: smoke Playwright em viewport de celular.
- [ ] **T802** Envio automático por tipo de ocorrência (143 T025) pelo canal preferido do contato.
      Evidência: teste de caso de uso.

## Fase 9 — Fechamento

> 🤖 Modelo: `opus` para a revisão; `haiku` para a documentação

- [ ] **T901** Revisão com `code-reviewer` e `security-reviewer` em `opus`: N+1 na listagem, PII em
      log, 500 sem stack trace, porta nova do webhook.
- [ ] **T902** `apps/*/CLAUDE.md`, `docs/ai-context/` e `docs/SECURITY.md` com "A ocorrência tem duas
      conversas".

## Prompt de execução

```text
Execute a spec specs/164-a-ocorrencia-tem-duas-conversas/ (leia spec.md, plan.md, tasks.md,
docs/adr/0071-a-conversa-multicanal-vem-do-pacote.md, docs/adr/0051-a-conversa-vem-do-pacote-o-tailwind-nao.md
e specs/143-a-contratante-responde-por-e-mail/ antes de começar).
Uma task por vez, na ordem do tasks.md, no worktree work/spec-164. Nada antes da T001 fechar.
Cada task fecha com typecheck + lint + testes da app (contrato E integração, os dois comandos do
CLAUDE.md) + commit isolado, evidência em evidence.md; teste novo entra na lista do package.json.
Pare e pergunte antes de: a T002 (conta Meta), qualquer segredo, deploy, migration destrutiva, e se
a versão do pacote exigida pela Fase 1 não estiver publicada.
```
