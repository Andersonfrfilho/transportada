# Tarefas — Feature 321

Cada etapa abre numa thread com o modelo indicado (regra de modelo por spec). Contrato antes do código. Tudo para `staging`;
nada para `main` (não é bug crítico). **Nenhuma task começa com `[NEEDS CLARIFICATION]` aberto em `spec.md`.**

- [x] **T0** Só leitura: casamento do canhoto, estado da nota, pontos de soma de carga, leitores do aviso à contratante, marcador.
      Resultado em `evidence.md`. — Modelo: sonnet
- [x] **T1** [contrato primeiro] Colunas `blocks_contractor_notice` e `counts_cargo_on_pickup_trip` (migration, rollback, schema,
      `PUT/GET occurrence-types`, cadastro recusa `true` de carga) e `occurrenceTypeNeverNotifiesContractor` nos quatro pontos de
      aviso; testes CA01 e CA02. — Modelo: opus
- [x] **T2** [contrato primeiro] Tabela `trip_canhoto_pickups` + registro (ocorrência e coleta na mesma transação) + `until_resolved` + CHECK de entregue intacto (CA03). — Modelo: opus
- [x] **T3** [contrato primeiro] Encaixe da coleta pelo escritório em viagem de outro motorista, volta a `pending` ao cancelar,
      contrato de que carga não a soma (CA03b). — Modelo: opus
- [x] **T4** [contrato primeiro] Casamento do canhoto da coleta no worker e no bot; andamento 266 (migration que relaxa os CHECKs,
      frase `canhoto_collected`, resolve e reabre); CA04. — Modelo: opus
- [x] **T5** Painel, tolerante primeiro: seletores na aba Tipos, encaixe da coleta, filtro por id do tipo, flag e tooltip (CA03c,
      CA05). — Modelo: sonnet
- [ ] **T6** App do motorista: parada "Coletar canhoto", foto, frase espelhada (paridade nas três apps); prints. — Modelo: sonnet
- [ ] **T7** Staging: tipo no script de configuração (dry-run primeiro), runbook, `apps/api-transportada/CLAUDE.md`,
      `docs/ai-context/api-transportada.md`, publicação painel → API → app e conferência de CA01–CA05. — Modelo: sonnet
