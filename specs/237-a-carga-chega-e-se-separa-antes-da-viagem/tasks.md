# Tarefas — 237

> **Ordem de execução (decidida em 2026-10-03):** Fase 1 → Fase 2 → **Fase 4a** → Fase 5 → _(Fase 3 e Fase 4b
> só depois de D4 e D6)_. Os XMLs do lote completo **não são necessários para construir**: só medem a taxa de
> vínculo, e as duas planilhas já analisadas (`planilha-fr.md`) bastam como fixtures.
> **Em aberto e fora da execução:** **D4** (avaria — Fase 3) e **D6** (endereço de entrada do e-mail — Fase 4b).
> A 237 não depende da 238 nas Fases 1–5; a 236 depende das duas.

## Fase 1 — Perfil do contratante e ficha

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [x] **T1.1** 🧠 ADR-0094 (eixo do recebimento + perfil por contratante) e modelo de dados do perfil
      (RF1) — revisão com `architect` em `opus`.
- [x] **T1.2** Migration aditiva `contractor_receiving_profiles` (FK composta, unique, CHECKs de faixa),
      `rollback.sql`, `make migration-test`, `db:generate` = `no_changes`.
- [x] **T1.3** Rotas do perfil (`settings.manage`, Zod `.strict()`) e contrato; atualizar as guardas de
      chave exata do agregado de contratante do painel (3 cópias).
- [x] **T1.4** Aba "Contratantes" em `/clientes` com a ficha (dados que o `PATCH /contractors` já aceita +
      perfil); locale pt-BR/en; contratos antes.
- [x] **T1.5** Revisão `opus`, **print aprovado pelo usuário**, publicar em staging e **confirmar o deploy**.
      _(Staging: deploy verde em `7cf745ec8`, 2026-10-03 19:35 UTC. Revisão de código das Fases 1–2 em
      2026-10-06 e as correções da API em `evidence.md` § "Correções da revisão das Fases 1–2"; a parte do
      painel é de outro executor. ⚠️ O aprovo do print pelo usuário não está registrado no `evidence.md`.
      **Produção: não** — só com o usuário, depois da medida de `nfe_participants` (`docs/SECURITY.md`,
      2026-10-06).)_

## Fase 2 — Chegada e primeira separação

> 🤖 Modelo: `sonnet` (T2.1 é 🧠)

- [x] **T2.1** 🧠 Eixo `expected/received/separated` por nota, com o agrupamento rota × cidade, e a política
      pura de transição (contrato em tabela antes; eventos append-only com ator e canal).
- [x] **T2.2** Migration `cargo_arrivals`, `cargo_arrival_documents`, `cargo_arrival_events` (+ rollback).
- [x] **T2.3** Casos de uso e rotas: registrar chegada (idempotente), agrupar por rota × cidade, separar;
      `separation_due_at` do perfil; integração contra Postgres.
- [x] **T2.4** Tela de Recebimento no painel (chegada, grupos rota × cidade) e a **tela do celular do
      separador** (PWA, por nota, agrupada por rota e cidade, alvo ≥ 44 px), contratos antes; prova por
      mutação.
- [x] **T2.5** Revisão `opus`, **print aprovado pelo usuário**, publicar em staging e confirmar o deploy.
      _(Staging: primeiro deploy verde com a Fase 2 em `cbfd4f356`, 2026-10-04 00:41 UTC. Mesma revisão e
      correções da T1.5 — a migration nova `20261006144825_cargo_arrival_check_null_holes` e as rotas novas
      ainda **não** foram publicadas (sem push nesta rodada). ⚠️ O aprovo do print pelo usuário não está
      registrado no `evidence.md`. **Produção: não** — só com o usuário.)_
- [ ] **T2.6** ⛔ **Bloqueada por decisão do usuário (M6 da revisão):** a cidade do grupo vem do `<enderDest>`
      (cadastro), não do destino físico `<entrega>` (spec 073); nota cadastrada em SP com entrega em Guarulhos
      cai na pilha de SP. Decidir se o grupo segue `resolvePhysicalDestination` — ADR-0094 §6.

## Fase 4a — Prévia por upload: ler, vincular e propor a chegada

> 🤖 Modelo: `sonnet` (T4.1 e T4.3 são 🧠). **Não depende de D6**: a prévia entra por **upload manual** da
> planilha no painel; o e-mail (Fase 4b) só troca a porta de entrada.

- [x] **T4.0** _(parcial)_ Comparação com XMLs reais (277 notas, 2 planilhas): taxas, `NroCarga` ↔
      `RouteName`, soma por cliente e prévia 2,7–4,2 h antes do XML — em `evidence.md`. A medição no conjunto
      completo continua possível por `consulta-recebimento-vs-xml.sql`, **sem bloquear**.
- [x] **T4.1** 🧠 Escolha e justificativa da biblioteca de planilha (XLSX/XLSM, só leitura, sem avaliar
      fórmula nem macro); limites de segurança (zip, linhas, tempo); ADR/plan atualizado. _(ADR-0094 §7:
      leitor próprio sobre `fflate` + `fast-xml-parser`, já dependências da API.)_
- [x] **T4.2** Migration `cargo_previews`/`cargo_preview_items` (+ rollback) e a rota de **upload** da
      planilha (`trip.manage`, tipo por bytes, tamanho limitado, idempotente pelo sha256).
      _(2026-10-04: migration `20261004140624_cargo_previews` com vínculo 1:1, pares, aliases, trilha e
      outbox próprio; envio, leitura, confirmar/desvincular/vincular e propor a chegada — `evidence.md`.
      Teto do arquivo 960 KiB, não 5 MiB: ADR-0094 §8.)_
- [x] **T4.3** 🧠 Leitura e validação por linha (aba `IMPORTAÇÃO`, cabeçalhos de rota ignorados, aba
      `RESULTADO` ignorada) e `cargo-preview-matching.policy.ts` (RF5a): roteiro ↔ carga pelos totais, cliente
      dentro do grupo, **n linhas ↔ 1 nota** por soma exata de valor e peso, 1:1 por nota; aprendizado
      `Company` ↔ CNPJ; vínculo manual; **reavaliação dos itens `awaiting_xml` a cada XML importado**.
      Contrato em tabela **antes**, com fixtures **anonimizadas** (inclusive roteiro de 20 linhas para 16
      notas); mutação.
      _(Parte A feita em 2026-10-04: leitor `parseCargoPreviewWorkbook` e política
      `resolveCargoPreviewMatches`, domínio puro, com corpus anonimizado e mutação — `evidence.md`. Falta a
      parte B: migration, rota, reavaliação a cada XML e vínculo manual. Peso com piso de 0,01 kg de
      arredondamento.)_ _(Parte B em 2026-10-04: worker lê e vincula por cópia por valor do domínio, com
      paridade; a nota importada pede a reavaliação num savepoint, coalescida — `evidence.md`.)_
- [ ] **T4.3a** _(opcional)_ Se o contratante passar a escrever o número dele nas informações adicionais da
      NF-e, lê-lo no importador e usá-lo como chave exata.
- [x] **T4.4** Tela de prévias no painel: itens esperados × vinculados × ambíguos × com erro, "esperando o
      XML" por item, vínculo manual; a prévia **propõe a chegada** (RF5b) para o operador confirmar a hora.
      _(2026-10-04: `/recebimento/previas` e `/recebimento/previas/:id`; prints a aprovar — `evidence.md`.)_
- [ ] **T4.5** Revisão `opus` + `security-reviewer`, **print aprovado**, publicar em staging e confirmar.

## Fase 5 — Recomendação de viagens

> 🤖 Modelo: `sonnet`

- [x] **T5.1** Rascunhos de viagem pelos grupos do contratante (`RouteName`) e ponte prévia/chegada →
      `POST /route-suggestions/multi-vehicle` (só notas vinculadas); contrato de que nenhuma viagem nasce sem
      o aceite (CA5).
- [x] **T5.2** Botão "Recomendar viagens" na prévia/chegada, com as duas visões lado a lado,
      reaproveitando o diálogo multi-veículo.
- [x] **T5.3** **Revisão de design e usabilidade** de todo o módulo (web.md §15), prints nos dois temas e
      375/768/1280 px **aprovados**; publicar e confirmar.

## Fase 3 — Avaria sem viagem e "devolver ao contratante"

> 🤖 Modelo: `sonnet` (T3.1 é 🧠). **D4 respondida (2026-10-06):** a mercadoria avariada pode ser devolvida ao
> contratante e precisa de uma marcação (RF8a).

- [x] **T3.1** 🧠 Modelo da ocorrência de recebimento (coluna com `CHECK` exatamente-um × tabela irmã) **e da
      marcação "devolver ao contratante"** (RF8a: estado novo no eixo × coluna ortogonal; efeito em fechar
      chegada, recomendação e proposta), validado com `architect` em `opus` contra as specs
      157/164/166/172/183/185. _(2026-10-06: ADR-0094 §9; `architect` opus APROVADO COM AJUSTES, os oito acolhidos
      — `evidence.md` § T3.1.)_
- [x] **T3.2** Migration aditiva + etapa `receiving` nos tipos; rota que recusa fora da janela (código
      estável); marcar/desmarcar/concluir a devolução (eventos append-only, ator, motivo); tratativa e portal
      enxergam a ocorrência nova.
      _(2026-10-06: migration `20261006180700_cargo_arrival_receiving_occurrence` e rotas `/cargo-arrivals/…/occurrences`,
      `…/return-{mark,unmark,complete}`; a marcação sai na rota de ocorrências, não na leitura da chegada — `evidence.md`
      § T3.2.)_
- [x] **T3.2b** Complemento da API: `GET /cargo-arrivals/:id/documents/:documentId/products` (`fleet.read`) — os itens
      da nota da chegada (sem NCM e CFOP) para o formulário de avaria da T3.3 escolher os "itens afetados".
      _(2026-10-06: `evidence.md` § T3.2b.)_
- [x] **T3.3** Tela (painel e celular): abrir avaria na nota da chegada (item, quantidade, foto) e a
      marcação "devolver ao contratante"; nota marcada sai da recomendação e da proposta de chegada; mutação;
      evidência. _(2026-10-06: `evidence.md` § T3.3; 36 prints a aprovar; **sem push** até o "pode publicar".)_
- [x] **T3.4a** Correções da revisão `opus` da Fase 3, lado API: concluir a devolução confere viagem viva, tratativa
      cancelada e ausente; a foto sobe ao bucket antes da trava da chegada; a leitura da avaria não cai por foto que não
      assina; nome de tipo colidindo é 409; erros tipados, aviso da semente e teto de requisições nas três rotas da
      devolução; **a tratativa da avaria de recebimento conduzida pelas rotas reais (o acerto `goods_paid` não fechava)**.
      _(2026-10-06: `evidence.md` § T3.4a; **sem push**.)_
- [x] **T3.4b** Painel: conduzir a tratativa da avaria de recebimento (ações do escritório) + correções do painel da
      revisão. _(2026-10-06: `evidence.md` § T3.4b; **sem push**.)_
- [x] **T3.4** Revisão `opus`, print aprovado, publicar e confirmar. _(2026-10-06: revisão `opus` REQUEST CHANGES → T3.4a/T3.4b;
      prints da T3.3 e da T3.4b aprovados pelo usuário ("pode publicar"); em staging no commit `17f3577a4`, deploy
      `37559003864` verde — `deploy-api` (com a conferência de migrations), `deploy-frontend`, `deploy-driver`, `deploy-client`.)_

## Fase 4b — Prévia por e-mail encaminhada _(D6 respondida: vocês encaminham)_

> 🤖 Modelo: `sonnet`

- [x] **T4.6** Ramo "prévia" no worker de e-mail de entrada, **para mensagem ENCAMINHADA** (D6): token do
      perfil no endereço, remetente do encaminhamento na allow-list do perfil, **remetente original** lido do
      cabeçalho e também na allow-list, MIME bruto guardado, DKIM do encaminhador verificado e o do contratante
      tratado como perdido (risco aceito no `SECURITY.md`); limite de tamanho do anexo igual ao do upload; o anexo cai no mesmo caso de uso do upload; contratos (CA1, CA2); `security-reviewer`.
      _(2026-10-07: migration `20261007040900_cargo_preview_email_intake` (aprovada pelo usuário: 3 colunas nulas no
      perfil, `source = 'email'` sem quem enviou e a tabela append-only `cargo_preview_email_intakes`), ramo
      `cargo-preview-email/` no worker, cópia por valor da criação da prévia com paridade, SECURITY (DKIM do
      contratante perdido = risco aceito) e ADR-0094 §10 — `evidence.md` § T4.6; **sem push**. Token e listas
      entram por SQL até a T4.6b; MX/Resend/listas são passo do usuário.)_
- [ ] **T4.6b** Rota `PUT` do perfil para **gerar/rotacionar o token** do endereço de entrada (mostra o token uma
      vez, guarda só o hash) e **editar as duas listas** (`preview_forwarder_allowlist`,
      `preview_sender_allowlist`), com auditoria; a ficha do contratante no painel mostra o endereço de entrada
      e as listas, e **as recusas recentes** (`cargo_preview_email_intakes`) por contratante. Contrato antes;
      o formato do token e o hash são os de `preview-inbound-token.policy.ts` (copiar por valor, com paridade).
      `sonnet`.
- [x] **T4.7a** Correções das revisões `opus` (código e segurança) da T4.6, **antes da publicação**: cabeçalho do MIME
      medido antes do DKIM (prévia e conversa), `l=` nunca alinha, janela por contratante com dois contadores pelo
      relógio do banco e rastro `RATE_LIMITED`, a conversa vence quando há os dois endereços, o MIME da vencedora
      nunca é apagado pela reentrega, parser do remetente original (Outlook, Apple pt-BR, `De:` dobrado, hostis),
      DKIM `unverifiable` repete a entrega, reenvio com o status da prévia, CHECK das listas, prefixo `email:` reservado
      no upload, contrato de que hash e listas não saem, paridade nos dois sentidos. Migration
      `20261007040900_cargo_preview_email_intake` **editada no lugar** (ainda não publicada). Docs: ADR-0094 §10,
      `SECURITY.md` (L3, L4, encaminhamento só manual, ordem de deploy). `evidence.md` § T4.7a; **sem push**.
- [ ] **T4.7b** Painel: aceitar `source: 'email'` na lista/detalhe da prévia + rótulo de origem + contrato do guard
      (hoje o guard de resposta da prévia no painel só conhece `upload`; a prévia por e-mail nasce com `source =
'email'` e `uploaded_by_user_id` nulo). `sonnet`.
- [x] **T4.7c** Correções da **segunda** passada de segurança `opus` sobre a T4.7a, **antes da publicação**: o `From` que
      lemos é o que a `mailauth` alinha (leitor exige o endereço literal no fim do valor + conferência do `headerFrom`
      da própria `mailauth`, código novo `FORWARDER_FROM_MISMATCH` no CHECK da migration ainda não publicada), leitor
      de MIME da conversa limitado (a `message/rfc822` aninhada é aberta pelo worker, depois da barreira, até 3 níveis;
      a prévia aplica a barreira à mensagem anexada), teto de assinaturas (8 DKIM, 3 ARC) e prazo de 15 s no DKIM, a
      barreira de cabeçalho com a regra de linha da `mailauth` (todo campo: 2 KiB os de endereço, 8 KiB os outros, soma
      dos repetidos), o contador de não autenticados para de GRAVAR e não de AVALIAR, nome de exibição com vírgula sem
      aspas. Contratos vermelhos antes, 15 mutações. `evidence.md` § T4.7c; **sem push**. `sonnet`.
- [ ] **T4.7** Revisão `opus` + `security-reviewer` (e-mail é entrada hostil: falsificação do remetente
      original, cabeçalhos forjados, anexo malicioso, reprocessamento), publicar e confirmar. _(Os achados da primeira
      revisão estão na T4.7a e os da segunda na T4.7c; esta é a revisão do que mudou, depois da T4.7b e da T4.7c.)_

## Fase 4c — Retenção dos dados da planilha (decisão do usuário: 90 dias)

> 🤖 Modelo: `sonnet`

- [ ] **T4.8** Rotina agendada (cron → fila → worker, no molde das rotinas existentes) que, 90 dias depois de
      a prévia ficar sem item em aberto (`awaiting_xml`/`suggested`/`ambiguous`), **apaga o arquivo do
      bucket** e **anonimiza** `recipient_name`, `address`, `neighborhood` e `postal_code` dos itens, mantendo
      valor, peso, roteiro, vínculo, estado e trilha; idempotente, com evento append-only, sem PII em log,
      prazo configurável por constante nomeada; contrato antes, integração contra Postgres, mutação; registrar
      no `SECURITY.md` como decidido.
      **Cobre também o MIME bruto** (`stored_objects.purpose = 'contractor_mail_raw'`) das mensagens da prévia por
      e-mail (`cargo_preview_email_intakes.raw_object_id`): ele guarda a planilha e os cabeçalhos do encaminhamento
      (T4.6, `SECURITY.md` 2026-10-06).
      ⚠️ **Só pode marcar `stored_objects.status = 'deleted'` e apagar o objeto do bucket** (T4.7a): a tabela de
      e-mails é append-only e a FK `RESTRICT` de `raw_object_id` impede anular a referência ou apagar
      `cargo_previews`/`stored_objects` referenciados — a linha do MIME **fica**, só o conteúdo some.

## Prompt de execução

Prompt para terminar o que falta da 237 e, depois dela, a 238 e a 236. Pode ser colado como está em
`/oh-my-claudecode:autopilot`. Estado de partida (2026-10-06): 237 Fases 1, 2, 4a e 5 **no ar em staging**; faltam
Fase 3, Fase 4b e Fase 4c; 238 e 236 não iniciadas; nada em produção.

```text
/oh-my-claudecode:autopilot Termine, nesta ordem, uma task por vez, o que falta das specs do TransportAdA:
(A) specs/237-a-carga-chega-e-se-separa-antes-da-viagem/ — Fase 3 (avaria sem viagem + "devolver ao contratante"),
    Fase 4b (prévia por e-mail ENCAMINHADO) e Fase 4c (retenção de 90 dias); (B) specs/238-os-dias-uteis-contam-
    feriado-e-aniversario-da-cidade/ inteira; (C) specs/236-o-contratante-tem-prazo-de-entrega/ inteira.
Antes de tocar em código leia, inteiros: spec.md, plan.md, tasks.md e evidence.md de cada spec; da 237 também
planilha-fr.md e docs/adr/0094-o-recebimento-da-carga-antes-da-viagem.md (§§2,4,6,7,8); CLAUDE.md da raiz e de cada
app tocada; docs/SECURITY.md (entradas da prévia). NÃO há [NEEDS CLARIFICATION] aberto: as decisões do usuário
(2026-10-06) estão em 237/spec.md — devolver ao contratante com marcação (D4), e-mail ENCAMINHADO pelo usuário (D6),
retenção de 90 dias, GPS por timeout aceito — e em 236/spec.md (3 dias úteis desde a chegada, feriado da cidade do
destinatário, só informa, não pesa na nota).

0) Arrumação (antes de qualquer feature): worktree/branch próprios a partir de origin/staging (git fetch antes).
   Confirme que o deploy da Fase 5 (commit 7f4ed4a94) terminou verde no GitHub Actions (deploy-api com "Conferir
   migrations aplicadas", deploy-frontend). Reconcilie as caixas T1.5, T2.5 e T4.5 do tasks.md da 237 com a evidência
   real: o que foi publicado e revisado marca [x] com a referência; se faltar a revisão code-reviewer opus daquela
   fase, rode-a sobre os commits da fase ANTES de marcar. Confira numeração de spec/ADR/migration em origin/staging.

1) Ordem e modelos. 237 Fase 3: T3.1 🧠 model=opus (valide o desenho com architect model=opus ANTES de implementar:
   ocorrência de recebimento = coluna com CHECK exatamente-um × tabela irmã, e a marcação "devolver ao contratante"
   como estado novo × coluna ortogonal; efeito em fechar chegada, recomendação (preencha findExcludedTripDraftDocumentIds
   da Fase 5, que hoje devolve vazio) e proposta de chegada) · T3.2 opus (migration) · T3.3 sonnet (telas painel e
   celular). 237 Fase 4b: T4.6 opus (entrada hostil), T4.7 com code-reviewer E security-reviewer model=opus; ATENÇÃO: o
   endereço de entrada exige o MX/domínio de entrada no Resend (passo do USUÁRIO, spec 143 T012) — construa e teste tudo
   com fixtures de e-mail, mas PARE e pergunte antes de qualquer configuração externa/DNS ou envio real. 237 Fase 4c:
   T4.8 sonnet (rotina cron → fila → worker no molde das existentes). 238: T1.1 🧠 opus (validar com architect), T1.2/T1.3
   sonnet, T2.x sonnet (calendário nacional vem de apps/frontend-transportada/src/components/ui/brazilianHoliday.service.ts,
   com contrato de PARIDADE painel × backend). 236: T1.1 🧠 opus, T1.2/T1.3 sonnet, T2.x sonnet (depende de 238 e da chegada
   da 237 Fase 2, já no ar). Revisão final de CADA fase com code-reviewer model=opus em passada separada (nunca o mesmo
   contexto que escreveu). Decisão de modelo/desenho nunca sobe para o executor sem a validação do architect.

2) Disciplina por task (inegociável): contrato ANTES do código (vermelho pelo motivo certo); typecheck + lint (por app,
   com a app como cwd) + o script `test` do package.json (NUNCA `bun test` cru no painel; na API contrato e integração são
   dois comandos, e a integração tocada é passada ARQUIVO A ARQUIVO como argumentos explícitos — o zsh não separa lista em
   variável e o Bun trata tudo como filtro: "0 testes" não é verde); prova por MUTAÇÃO de cada regra (vermelho e restaure,
   git diff --quiet); commit isolado por task com `git add <caminhos explícitos>` e `--no-verify` (nunca git add -A); evidência
   em evidence.md com comandos e contagens REAIS. Relatório de subagente NÃO é evidência: confira `git log` e rode os gates
   você mesmo antes de reportar. Sem stub, TODO, teste pulado ou `.only`. Contratos de DOM do painel: nada de
   `expect(nó).toBeNull()` dentro de `waitFor` (formata o nó e estoura o prazo); prove `bun run test:hooks` ≥ 10 execuções
   verdes e ≥ 3 com carga de CPU em paralelo. Código: inglês, comentário só se o PORQUÊ não for óbvio (1 linha), sem any,
   sem default export, >1 parâmetro ⇒ objeto, arquivo ≤ 200 linhas, função ≤ 40, copyright Ada Technology nos arquivos novos,
   string repetida 2+ vezes vira constante, nunca CNPJ/nome de contratante no src/, logs sem PII.

3) Banco e migrations: aditivas, com rollback.sql; ANTES de gerar, git fetch e confira o FIM da cadeia de snapshots em
   apps/api-transportada/drizzle/*/snapshot.json (prevIds do novo aponta para a migration mais recente do staging; bifurcação
   faz o db:generate mentir `no_changes` — verifique que nenhum snapshot tem dois filhos); `make migration-test` verde;
   `bun run db:generate` = no_changes depois. Migration em tabela existente e central (ex.: nfe_documents) NÃO sem
   decisão do usuário. Nunca leia banco de produção (o MCP mcp__postgres__query é proibido); integração só no Postgres do
   .env.test ou num banco descartável (o `make worker-integration` usa um banco local compartilhado com diário divergente:
   use um banco novo e diga exatamente o que rodou). Fixtures de teste: planilhas e XMLs reais ANONIMIZADOS (sem razão
   social, CNPJ, CEP ou endereço reais; os arquivos reais ficam fora do repo) com o teste de ausência de PII.

4) Toda TELA: contratos antes, revisão de design (web.md §15: vizinhos, contraste ≥ 4,5:1 nos dois temas, alvo ≥ 44 px a
   375 px, sem scroll horizontal), prints em 375/768/1280 px nos temas escuro e claro com DADOS FICTÍCIOS, ENVIADOS ao
   usuário (SendUserFile) — e a publicação só depois do "pode publicar" dele. Nada visível a produção sem esse aprovo.

5) Publicar em staging (só com tudo verde; produção NUNCA): git fetch → git rebase origin/staging verificando o CÓDIGO DE
   SAÍDA de cada comando (um `| tail` mascara o erro e já levou a push no meio de rebase parado) → resolver conflitos mantendo
   os DOIS lados (listas de teste do package.json: só acrescente seu arquivo; docs ai-context: preserve o texto alheio) →
   bun install --frozen-lockfile → typecheck das apps tocadas → todos os gates → format:check na RAIZ → push → acompanhar
   o deploy até o fim e CONFIRMAR deploy-api (inclusive "Conferir migrations aplicadas"), deploy-frontend e
   deploy-services quando houver worker/cron. Gate vermelho: leia o log antes de qualquer rerun (flake de porta do smoke
   do painel é conhecido; teste instável não é flake — ache a causa). Uma fase só segue depois do deploy da anterior.

6) Pare e pergunte antes de: produção; migration destrutiva; DNS/MX/Resend/envio real de e-mail; qualquer [NEEDS
   CLARIFICATION] novo; mudar o roteirizador, o fluxo de viagem/aceite, a nota do motorista, `missingAfterHours` ou o CT-e;
   tocar tabela central existente; reler dado de produção; qualquer decisão de produto não escrita nas specs. Se um achado
   de revisão (segurança, código) for grave, corrija e revalide antes de publicar.

7) Fim: todas as caixas [x] com evidência, docs vivos atualizados (domain-model, ai-context, CLAUDE.md das apps, ADR-0094,
   SECURITY.md), final da checklist do autopilot cumprida e um resumo ao usuário do que está no ar, do que NÃO foi
   verificado e dos follow-ups: `previewId` em POST /cargo-arrivals (preencher arrival_id), rota para revogar alias,
   `counts` na lista de prévias, preencher `arrival_reference_label` nos perfis de staging, migration de contração que
   apague `arrival_reference_pattern`, índice (company_id, created_at) em nfe_documents (medir antes), fila offline do toque
   do separador, falha pré-existente osrm-routing-matrix da integração do worker.
```
