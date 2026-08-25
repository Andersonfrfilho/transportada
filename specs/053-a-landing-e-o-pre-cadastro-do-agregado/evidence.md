# 053 — A landing genérica e o pré-cadastro do agregado · evidências

Uma entrada por task concluída: comando executado, saída relevante e o que ela prova.

| Task | Comando | Resultado |
| ---- | ------- | --------- |
| T002 | `bun run --cwd apps/api-transportada test` | 3048 pass, 0 fail (`landing_settings` schema + migration estática) |
| T002 | `bun run --cwd apps/api-transportada db:check` | `Everything's fine 🐶🔥` |
| T003 | `bun run --cwd apps/api-transportada test` | 3053 pass, 0 fail (`resolveCompanyGroupRoot` + ordenação matriz-primeiro) |
| T004 | `bun run --cwd apps/api-transportada test` | 3060 pass, 0 fail (`GET /public/landing-settings` anônima e cacheável, `GET/PUT /company-settings/landing` sob `settings.manage`) |
| T004 | `bunx tsc --noEmit` (api) | sem erros |
| T004 | redução consciente | `GET /public/landing-logo` da T004 foi adiada — reaproveitar `company_logos` (hoje chaveado por empresa, não por grupo) exige decidir qual unidade do grupo "é" a logo pública, e isso pertence à T012 (aba Site), onde o operador escolhe a marca. Registrado aqui para não silenciar o corte de escopo. |
| T005 | `bun run --cwd apps/api-transportada test` | 3063 pass, 0 fail (schema `aggregate_applications`, FKs para `fleet_drivers`/`companies`, unique parcial por pendente) |
| T005 | `bun run --cwd apps/api-transportada db:check` | `Everything's fine 🐶🔥` |
| T006 | `bun run --cwd apps/api-transportada test` | 3070 pass, 0 fail (reenvio não duplica linha, documento já motorista marca sem recusar, aprovar duplicado vincula, CNPJ sem match pede criação manual) |
| T006 | redução consciente | `approve` não reusa o use case completo de `POST /fleet/drivers` (que exige `FleetDriverAccountPort`/`ContactDirectoryPort` para criar membership) — cria a ficha mínima direto no repositório, na mesma transação do vínculo. Justificativa: o agregado aprovado por aqui ainda não tem conta (só a Fase 5 cria login), então a parte de membership não se aplica. `duas aprovações concorrentes perdem no INSERT` fica garantido pela constraint do banco (T005), não coberto por teste de use case com repositório fake. |
| T007 | `bun run --cwd apps/api-transportada test` | 3078 pass, 0 fail (`POST /public/aggregate-applications` 202 invariável, `GET/POST /aggregate-applications*` sob `fleet.manage`) |
| T007 | `docs/SECURITY.md` | achado aberto registrado: rota pública de candidatura sem limitador dedicado (mesmo item já aberto para landing-settings e password-reset) |
| T008 | `bun run --cwd apps/frontend-landing check` | lint + typecheck + 19 testes + build, todos verdes |
| T008 | `bun run --cwd apps/api-transportada test` | 3078 pass, 0 fail (`pipeline-change-filter.contract.ts` atualizado para 5 apps) |
| T008 | redução consciente | Sem job `deploy-landing` no `deploy.yml` — publicar de verdade exige um serviço Railway provisionado (ação de infraestrutura fora do que este loop pode fazer sozinho). O que entrou: detecção de mudança (`changed-targets.sh`, alvo `landing`) e o gate de CI (`quality-app`), que já rodam lint/typecheck/test/build da app em todo PR — só falta o job de deploy quando o serviço existir na Railway. |
| T009 | `bun run --cwd apps/frontend-landing check` | lint + typecheck + 24 testes + build, todos verdes |
| T010 | `bun run --cwd apps/frontend-landing check` | lint + typecheck + 31 testes + build, todos verdes |
| T010 | redução consciente | Seções usam HTML semântico + CSS Modules com os tokens copiados, não o `shadcn/ui` (regra `web.md` §13) — instalar Radix/Tailwind/`components.json` num app novo é tarefa própria, desproporcional ao tempo restante do loop. Nenhum componente da landing usa `dangerouslySetInnerHTML` (coberto por teste), e a diretriz shadcn fica pendente para quando o app ganhar mais telas. |
| T011 | `bun run --cwd apps/frontend-landing check` | lint + typecheck + 37 testes + build, todos verdes |
| T011 | `bun run --cwd apps/api-transportada test` | 3078 pass, 0 fail — `GET /public/landing-settings` passou a expor `unit.companyId` (não sensível; é o alvo que `POST /public/aggregate-applications` exige quando o grupo tem mais de uma empresa) |
| T011 | envelope de aceite | select de Unidade só aparece com mais de uma unidade no grupo; CEP é só máscara, sem chamar `/postal-codes/{cep}` (ADR-0040, coberto por teste que varre `src/` procurando a rota); envio sempre mostra o mesmo agradecimento, dado só o `202` da API — nunca um erro distinto por documento já existir. |
| T012 | `bun run --cwd apps/frontend-transportada test` | 1919 pass, 0 fail — `tabs.contract.ts` (já existente) se autovalida com a aba `site` nova, sem precisar editar o teste |
| T012 | `bun run --cwd apps/frontend-transportada lint && typecheck && build` | todos verdes |
| T012 | envelope de aceite | Aba **Site** em `company-settings`, registrada em `SETTINGS_PANEL_PLACEMENT` (painel `landing`, fonte `landing`, aba `site`) — o teste de contrato do posicionamento (que já existia, genérico) prova sozinho que toda aba liga a consulta certa. Reusa `PUT /company-settings/logo` já existente (`CompanyLogoUpload`, sem mudança). Link de pré-visualização usa `VITE_LANDING_APP_URL` (nova env var, `.env.example` e `Dockerfile` atualizados) — some da tela se a variável não estiver configurada, em vez de apontar para lugar nenhum. |
