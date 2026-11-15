# Tasks — 340 Portal de entregas do contratante e do destinatário

Regra: teste de aceite antes da implementação; task só fecha com evidência em `evidence.md`. Tudo passa por staging.
Modelo por etapa (regra do projeto): **Opus 5.5** onde há segurança/recorte/migração; **Sonnet 5.5** para telas e prints.

- [ ] **T0 — Investigar** (Sonnet 5.5): marcos de entrega já gravados (viagem, parada, ocorrência), onde mora o destinatário
      (`delivery_clients`), reaproveitar `resolveContractorScope`, serializador da 183. Registrar em `evidence.md`.
- [ ] **T1 — Fechar as Dúvidas 1–5** com o Anderson e atualizar esta spec. (humano)
- [ ] **T2 — Banco** (Opus 5.5): `recipient_portal_bindings` + papel `recipient`; migration aditiva com rollback guardado.
- [ ] **T3 — API do destinatário** (Opus 5.5): escopo, rotas existentes aceitando o perfil, contratos negativos (CA01).
- [ ] **T4 — Eventos da entrega** (Opus 5.5): `/events`, serializador próprio, contrato de campos proibidos (CA02).
- [ ] **T5 — Chat da entrega** (Opus 5.5): assunto "entrega" na conversa, aviso por e-mail sem corpo (CA03).
- [ ] **T6 — Relatórios + CSV** (Opus 5.5): consultas por recorte, escape de fórmula (CA04).
- [ ] **T7 — Vínculo no painel** (Sonnet 5.5): convidar/vincular destinatário em `users.manage`; padrão visual do painel.
- [ ] **T8 — Portal: resumo, lista, entrega com linha do tempo e mapa de eventos** (Sonnet 5.5).
- [ ] **T9 — Portal: chat da entrega e relatórios** (Sonnet 5.5).
- [ ] **T10 — Prints (claro/escuro, desktop/celular), evidence.md, runbook e staging** (Sonnet 5.5): migration → API → painel → portal.
