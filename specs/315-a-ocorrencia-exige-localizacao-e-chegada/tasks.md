# Tarefas — Feature 315

Cada etapa abre numa thread com o modelo indicado (regra de modelo por spec do projeto). Contrato antes do código em toda task.
Tudo vai para `staging`; nada para `main` sem aprovação (a feature não é bug crítico).

- [ ] **T0** Confirmar no código o que o plano supõe: `stopArrived` no snapshot do motorista, trava de linha da parada na 294,
      rota de parada do escritório (corpo e auditoria). Só leitura; resultado em `evidence.md`. — Modelo: sonnet
- [ ] **T1** Medir o efeito de D7: tipos `flow: stop` ativos com `attachment_mode`/`note_mode` = `required` em staging e
      produção (script `.sh` em `tmp/ops/`, saída em arquivo, runbook atualizado). Se houver tipo afetado em produção, a
      cobrança de foto/observação da parada (T4) sobe em PR separado. — Modelo: sonnet
- [ ] **T2** [contrato primeiro] Migration `location_mode`/`arrival_time_mode` + rollback + CHECKs + schema Drizzle + asserção de
      migration (modelo `occurrence-declared-amount.*`). — Modelo: sonnet
- [ ] **T2b** [contrato primeiro] Coluna `min_wait_after_arrival_minutes` (D10) na mesma migration da T2 + CHECK com `arrival_time_mode`;
      política de espera mínima (`availableAt`), bloqueio no `reportStopOccurrence` (rota do escritório isenta, com horário de chegada obrigatório), `serverNow`/`availableAt` no snapshot. —
      Modelo: opus
- [ ] **T3** [contrato primeiro] Política pura `occurrence-arrival-time.policy.ts` e guarda: `locationMode`/`arrivalTimeMode` em
      `resolveOccurrenceRequirements`, erros novos, tabela de casos (D3–D6). — Modelo: opus
- [ ] **T4** [contrato primeiro] `reportStopOccurrence`: guarda de foto/observação/localização/horário, chegada na mesma
      transação via `performSequencedStopArrival`, `arrivalRecorded`, corrida com o toque, ordem (`409`), idempotência; teste
      de integração com banco. Rota do motorista e do escritório (escritório sem localização). — Modelo: opus
- [ ] **T5** Escrita e leitura do tipo (`PUT/GET occurrence-types`), snapshot do motorista, lista de tipos de campo e
      `read-settings-resolution`; registro por nota cobra só `locationMode` (D2). — Modelo: sonnet
- [ ] **T6** Painel: tipos e validação tolerantes (primeiro), depois seletores **Localização** e **Horário de chegada** na aba
      Tipos usando o seletor padrão de modo; locale; prints claro/escuro, desktop/celular comparados com outra tela. —
      Modelo: sonnet
- [ ] **T7b** App: tipo bloqueado com contador regressivo (relógio do servidor) e mensagem "marque Cheguei primeiro"; prints. —
      Modelo: sonnet
- [ ] **T7** App do motorista: modos no resolvedor espelhado (contrato de paridade), campos faltantes, rascunho, componentes
      `OccurrenceLocationField` e `OccurrenceArrivalTimeField` (design system do app), montagem do `arrivedAt` com virada de
      dia, fila só com ponto capturado, diálogo de ordem da parada; prints. — Modelo: sonnet
- [ ] **T8** Contrato de paridade do `resolveOccurrenceRequirements` nas três apps com os dois campos. — Modelo: sonnet
- [ ] **T9** WhatsApp: o bot traduz os 422 (localização, horário, espera mínima) em "este tipo precisa ser registrado pelo
      app" ou "só abre às HH:mm" (usa `availableAt`); o atendente do escritório pelo WhatsApp registra sem a trava, informando a hora da chegada. — Modelo: sonnet
- [ ] **T10** Documentação: `apps/api-transportada/CLAUDE.md` e `docs/ai-context/api-transportada.md` (contrato), CLAUDE.md da
      raiz (parágrafo curto), runbook § de staging; `evidence.md` da spec. — Modelo: sonnet
- [ ] **T11** Publicação em staging na ordem D9 (painel → API → app) e **só então** o script de configuração dos tipos (thread
      "Listar tipos de ocorrência a validar em staging"); CA05 conferido em staging. — Modelo: sonnet
