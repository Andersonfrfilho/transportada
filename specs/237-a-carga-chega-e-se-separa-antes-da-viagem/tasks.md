# Tarefas — 237

> Restam **D4** (bloqueia só a Fase 3) e **D6** (bloqueia só a Fase 4) em `spec.md`; as **Fases 1–2 não
> dependem delas**. Sem prompt de execução até D4 e D6 serem respondidas. O exemplo real da planilha já
> está analisado em `planilha-fr.md`. A 237 não depende da 238 nas Fases 1–4; a 236 depende das duas.

## Fase 1 — Perfil do contratante e ficha

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [ ] **T1.1** 🧠 ADR-0094 (eixo do recebimento + perfil por contratante) e modelo de dados do perfil
      (RF1) — revisão com `architect` em `opus`.
- [ ] **T1.2** Migration aditiva `contractor_receiving_profiles` (FK composta, unique, CHECKs de faixa),
      `rollback.sql`, `make migration-test`, `db:generate` = `no_changes`.
- [ ] **T1.3** Rotas do perfil (`settings.manage`, Zod `.strict()`) e contrato; atualizar as guardas de
      chave exata do agregado de contratante do painel (3 cópias).
- [ ] **T1.4** Aba "Contratantes" em `/clientes` com a ficha (dados que o `PATCH /contractors` já aceita +
      perfil); locale pt-BR/en; contratos antes.
- [ ] **T1.5** Revisão `opus`, publicar em staging e **confirmar o deploy**; **print aprovado antes**.

## Fase 2 — Chegada e primeira separação

> 🤖 Modelo: `sonnet` (T2.1 é 🧠)

- [ ] **T2.1** 🧠 Eixo `expected/received/separated` por nota, com o agrupamento rota × cidade, e a política pura de transição
      (contrato em tabela antes; eventos append-only com ator e canal).
- [ ] **T2.2** Migration `cargo_arrivals`, `cargo_arrival_documents`, `cargo_arrival_events` (+ rollback).
- [ ] **T2.3** Casos de uso e rotas: registrar chegada (idempotente), organizar por cidade, atribuir rota;
      `separation_due_at` do perfil; integração contra Postgres.
- [ ] **T2.4** Tela de Recebimento no painel (chegada, grupos rota × cidade) e a **tela do celular do separador** (PWA, por nota, agrupada por rota e cidade, alvo ≥ 44 px), contratos antes; prova por mutação.
- [ ] **T2.5** Revisão `opus`, print aprovado, publicar em staging e confirmar o deploy.

## Fase 3 — Avaria sem viagem

> 🤖 Modelo: `sonnet` (T3.1 é 🧠)

- [ ] **T3.1** 🧠 Modelo da ocorrência de recebimento (coluna com `CHECK` exatamente-um × tabela irmã),
      validado com `architect` em `opus` contra as specs 157/164/166/172/183/185.
- [ ] **T3.2** Migration aditiva + etapa `receiving` nos tipos; rota que recusa fora da janela (código
      estável); tratativa e portal enxergam a ocorrência nova.
- [ ] **T3.3** Tela: abrir avaria na nota da chegada (item, quantidade, foto); mutação; evidência.
- [ ] **T3.4** Revisão `opus`, print aprovado, publicar e confirmar.

## Fase 4 — Prévia por e-mail

> 🤖 Modelo: `sonnet` (T4.1 é 🧠). **Bloqueada por D6.** Exemplo real disponível em `planilha-fr.md`.

- [ ] **T4.0** Rodar `consulta-recebimento-vs-xml.sql` (somente leitura) e registrar o resultado em
      `evidence.md`: mede quantas linhas acham uma nota só por valor + CEP e fixa os limites de confiança do
      vínculo (RF5a).
- [ ] **T4.1** 🧠 Escolha e justificativa da biblioteca de planilha; limites de segurança (zip, linhas,
      tempo, fórmulas); ADR/plan atualizado.
- [ ] **T4.2** Ramo "prévia" no worker de e-mail de entrada (conforme D6: token do perfil, DKIM,
      allow-list, MIME bruto); migration `cargo_previews`/`cargo_preview_items`; contratos antes
      (CA1–CA4), usando as três planilhas `FR` (anonimizadas) como fixtures.
- [ ] **T4.3** Leitura e validação por linha (aba `IMPORTAÇÃO`, cabeçalhos de rota ignorados); vínculo por
      por conteúdo dentro do universo do contratante (valor, CEP, destinatário, cidade, peso;
      `matched/ambiguous/suggested`, 1:1), aprendizado `Company` ↔ CNPJ do destinatário e vínculo manual;
      passo que vincula quando o XML chega; registro do recebimento do e-mail e comparação com o do XML.
- [ ] **T4.3a** (depende de D8) Extrair o número do pedido (`xPed`) no importador de NF-e e usá-lo como
      evidência forte no vínculo.
- [ ] **T4.4** Tela de prévias (esperadas × com XML × erro).
- [ ] **T4.5** Revisão `opus` + `security-reviewer`, print aprovado, publicar e confirmar.

## Fase 5 — Proposta de roteiros

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Recomendação de viagens: rascunhos pelos grupos do contratante (`RouteName`) e ponte
      prévia/chegada → `POST /route-suggestions/multi-vehicle` (só notas `matched`); contrato de que nenhuma
      viagem nasce sem o aceite (CA5).
- [ ] **T5.2** Botão "Recomendar viagens" na prévia/chegada, com as duas visões lado a lado, reaproveitando o diálogo multi-veículo.
- [ ] **T5.3** **Revisão de design e usabilidade** de todo o módulo (web.md §15), prints nos dois temas e
      375/768/1280 px aprovados; publicar e confirmar.
