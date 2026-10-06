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
- [ ] **T1.5** Revisão `opus`, **print aprovado pelo usuário**, publicar em staging e **confirmar o deploy**.

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
- [ ] **T2.5** Revisão `opus`, **print aprovado pelo usuário**, publicar em staging e confirmar o deploy.

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

- [ ] **T3.1** 🧠 Modelo da ocorrência de recebimento (coluna com `CHECK` exatamente-um × tabela irmã) **e da
      marcação "devolver ao contratante"** (RF8a: estado novo no eixo × coluna ortogonal; efeito em fechar
      chegada, recomendação e proposta), validado com `architect` em `opus` contra as specs
      157/164/166/172/183/185.
- [ ] **T3.2** Migration aditiva + etapa `receiving` nos tipos; rota que recusa fora da janela (código
      estável); marcar/desmarcar/concluir a devolução (eventos append-only, ator, motivo); tratativa e portal
      enxergam a ocorrência nova.
- [ ] **T3.3** Tela (painel e celular): abrir avaria na nota da chegada (item, quantidade, foto) e a
      marcação "devolver ao contratante"; nota marcada sai da recomendação e da proposta de chegada; mutação;
      evidência.
- [ ] **T3.4** Revisão `opus`, print aprovado, publicar e confirmar.

## Fase 4b — Prévia por e-mail encaminhada _(D6 respondida: vocês encaminham)_

> 🤖 Modelo: `sonnet`

- [ ] **T4.6** Ramo "prévia" no worker de e-mail de entrada, **para mensagem ENCAMINHADA** (D6): token do
      perfil no endereço, remetente do encaminhamento na allow-list do perfil, **remetente original** lido do
      cabeçalho e também na allow-list, MIME bruto guardado, DKIM do encaminhador verificado e o do contratante
      tratado como perdido (risco aceito no `SECURITY.md`); limite de tamanho do anexo igual ao do upload; o anexo cai no mesmo caso de uso do upload; contratos (CA1, CA2); `security-reviewer`.
- [ ] **T4.7** Revisão `opus` + `security-reviewer` (e-mail é entrada hostil: falsificação do remetente
      original, cabeçalhos forjados, anexo malicioso, reprocessamento), publicar e confirmar.

## Fase 4c — Retenção dos dados da planilha (decisão do usuário: 90 dias)

> 🤖 Modelo: `sonnet`

- [ ] **T4.8** Rotina agendada (cron → fila → worker, no molde das rotinas existentes) que, 90 dias depois de
      a prévia ficar sem item em aberto (`awaiting_xml`/`suggested`/`ambiguous`), **apaga o arquivo do
      bucket** e **anonimiza** `recipient_name`, `address`, `neighborhood` e `postal_code` dos itens, mantendo
      valor, peso, roteiro, vínculo, estado e trilha; idempotente, com evento append-only, sem PII em log,
      prazo configurável por constante nomeada; contrato antes, integração contra Postgres, mutação; registrar
      no `SECURITY.md` como decidido.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/237-a-carga-chega-e-se-separa-antes-da-viagem/ (leia
spec.md, plan.md, tasks.md e planilha-fr.md inteiros antes de começar), SOMENTE as fases 1, 2, 4a e 5, nessa
ordem, uma task por vez. As decisões D4 e D6 foram respondidas em 2026-10-06 (ver spec.md): as Fases 3, 4b e 4c entram na execução. Worktree/branch
próprios a partir de origin/staging (git fetch antes; confirme que o número 237 e o próximo ADR (0094)
continuam livres em origin/staging e nos outros worktrees).
Modelos: tasks 🧠 (T1.1, T2.1, T4.1, T4.3) com model=opus e validação do desenho por architect model=opus
antes de implementar; as demais com executor model=sonnet; revisão final de cada fase com code-reviewer
model=opus em passada separada (T4.5 também com security-reviewer).
Cada task fecha com: contrato antes (vermelho pelo motivo certo), typecheck, lint com cwd na app, teste pelo
script do package.json (nunca bun test cru; API: contrato e integração são dois comandos), format:check na
raiz, prova por mutação, commit isolado com caminhos explícitos (--no-verify, nunca git add -A), evidência em
evidence.md. Migration aditiva com rollback.sql: make migration-test e db:generate = no_changes; integração
contra um Postgres que responda (pular não é passar). Publicar em staging só com tudo verde (fetch + rebase
limpo + bun install --frozen-lockfile + typecheck) e CONFIRMAR o deploy antes da fase seguinte.
Toda tela: contratos antes, revisão de design (web.md §15), print ENVIADO ao usuário e publicação só depois de
aprovado. Fixtures de teste: as planilhas FR e os XMLs reais ANONIMIZADOS (sem razão social, CNPJ ou
endereço reais). Nunca leia banco de produção.
Pare e pergunte antes de: produção, migration destrutiva, qualquer [NEEDS CLARIFICATION] aberto, mudar o
roteirizador ou o fluxo de viagem existente, e qualquer mudança visível de tela sem print aprovado.
```
