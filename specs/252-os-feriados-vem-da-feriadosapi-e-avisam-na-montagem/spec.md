# Feature 252 — Os feriados vêm da FeriadosAPI e avisam na montagem

> **Estado:** desenho fechado pelo `architect` (`opus`, 2026-10-07) e **validado contra o código na T0.1** (mesmo dia;
> 22 correções no lugar, nenhuma decisão do usuário mudou — `evidence.md` § T0.1). **ADR-0100 aceita.** A Fase 1 (o
> roteirizador por cidade) já está em staging (`4454228ac`). **Duas dúvidas de produto abertas (Q3, Q4)** que **não
> bloqueiam código** e **bloqueiam ligar a rotina** (configurar o token e despausar). Aviso no app do motorista
> acrescentado pelo usuário no mesmo dia (Q5b, D12). **ADR-0100** (emenda o ADR-0048 §3 e o "fora do escopo" da 238).
> Migration **só staging**; produção exige aprovação própria.
> **Número:** 252 e ADR 0100 conferidos livres em `origin/staging` e nos worktrees em 2026-10-07 (ADR 0099 reservado
> pela 251). Reconferir antes de publicar.

## Problema e resultado

O calendário de dias úteis da 238 sabe contar feriado municipal e estadual, mas eles só entram **à mão**, e ninguém
digita: a amostra local de NF-e tem **67 cidades de destino distintas**, todas em SP e nenhuma capital, e nenhuma
tem feriado cadastrado. O prazo da 236 conta dia útil a mais nessas cidades, e a montagem da viagem só avisa feriado
**nacional**, e só para a última parada (`routeSchedule.service.ts` ~31–75).

E havia um defeito que a importação tornaria visível: o roteirizador (`readPoolWindows`, então em
`drizzle-route-optimization.repository.ts` ~1050–1076) buscava só `holidayOn` das cidades do roteiro e aplicava a mesma
lista a **todos** os clientes. O feriado da cidade B fechava o cliente da cidade A. Com ~4 feriados por cidade e 20
cidades por roteiro, cerca de 1 dia útil em 5 fecharia todos os clientes. **Corrigido em 2026-10-07** (Fase 1, em
staging: `913aad994`, `4454228ac`, `1754e36e7`; a leitura mora agora em `routing/infrastructure/drizzle-pool-window.query.ts`).

Pedido do usuário (2026-10-07): puxar os feriados da **FeriadosAPI** (`https://feriadosapi.com`), aos poucos e
respeitando o limite, **gravando no nosso banco**, até cobrir todas as cidades **de destino das notas que já temos**,
e fazer os feriados importados **avisarem na montagem** quando uma entrega cair numa cidade em feriado.

**Resultado:**

1. O roteirizador fecha só os clientes da cidade em feriado (Fase 1, sem migration, antes de qualquer importação).
2. Uma rotina diária (`holiday.provider.pull`) descobre as cidades de destino físico das notas, busca os feriados delas
   na FeriadosAPI dentro do limite e do orçamento, e grava os municipais e estaduais no calendário da empresa — sem
   nunca sobrescrever o que o operador digitou.
3. A aba Calendário mostra a origem de cada feriado, permite desligar e restaurar o importado (com auditoria) e mostra
   o status da importação.
4. A montagem da viagem (por parada) e o detalhe da viagem (selo nas paradas) avisam quando a entrega prevista cai em
   feriado da cidade — só informam, nunca bloqueiam.
5. O **app do motorista** avisa, em cada parada da viagem dele, quando a entrega cai em feriado da cidade da parada —
   texto curto de campo, funciona sem rede, nunca esconde nem bloqueia ação, e a nota do motorista não muda.

## Decisões do usuário (2026-10-07; não reabrir)

- **Fonte:** FeriadosAPI, gradual, respeitando o limite, gravando no banco, até cobrir as cidades.
- **Cidades:** as de **destino das notas que já temos**, pelo destino físico (`resolvePhysicalDestination`, spec 073;
  ADR-0096 Q2).
- **Efeito:** os feriados importados entram no calendário e **avisam** na montagem quando a entrega cair em feriado.
- **Q1 — aprovada:** corrigir o roteirizador **antes** de a importação valer (Fase 1, sem migration).
- **Q2 — aprovada:** migration aditiva **só para staging** nesta spec; produção exige aprovação própria.
- **Q5 — aprovada:** os avisos aparecem na **montagem da viagem** (por parada, no lugar do aviso que hoje só olha
  feriado nacional) e no **detalhe da viagem** (selo nas paradas). Na **seleção de notas não** (não existe data ainda).
- **Q5b — pedido do usuário (2026-10-07, depois do desenho):** _"e o aviso no app do motorista também"_. O app do
  motorista (`apps/frontend-driver`) mostra o aviso por parada da viagem dele (D12, RF13, RF14).

### Abertas — `[NEEDS CLARIFICATION]` (não bloqueiam código; bloqueiam ligar a rotina)

- **Q3 — `[NEEDS CLARIFICATION]` Plano e cota.** As 67 cidades da amostra estão todas fora das 27 capitais. O plano
  gratuito cobre nacionais, estaduais e capitais; o interior "consome cota" e a documentação não diz quanto. O plano
  Developer custa **R$ 39/mês com 5.000 consultas/mês**; as 645 cidades de SP × 2 anos = 1.290 consultas cabem no 1º
  mês, e a amostra pede ≈ 138 na carga e ≈ 23/mês depois. **Pergunta:** qual plano, e qual valor de
  `FERIADOS_API_MONTHLY_REQUEST_BUDGET` (padrão proposto: o limite mensal do plano escolhido menos 10% de folga)? O
  orçamento é **por instalação** (o contador mora no banco de cada uma, ADR-0021): uma chave compartilhada entre
  transportadoras divide os 60/min e a cota sem que um banco veja o outro — uma chave por instalação, ou o orçamento de
  cada uma dividido.
- **Q4 — `[NEEDS CLARIFICATION]` Termos de uso.** A página de termos respondeu 404 e a documentação não diz se os
  dados podem ser guardados. Risco registrado no ADR-0100 e em `docs/SECURITY.md` (2026-10-07). **Passo do usuário:**
  confirmar com o fornecedor que guardar os feriados é permitido **antes** de configurar o token.

### Passos do usuário (nunca da IA)

Criar a conta na FeriadosAPI, gerar a chave, escolher o plano (Q3), confirmar os termos (Q4), configurar
`FERIADOS_API_TOKEN` (e, se diferente do padrão, `FERIADOS_API_MONTHLY_REQUEST_BUDGET`) no serviço do **worker** em
staging e **despausar** a rotina `holiday.provider.pull` no painel (ela nasce pausada de fábrica, D13). Sem token, a
rotina não é registrada e nada sai do produto.

## Decisões por delegação (revogáveis; detalhadas no ADR-0100 §2)

- **D1 — Cache global, efeito por empresa.** A resposta do fornecedor é fato público e vai para tabelas sem
  `company_id` (precedente `geocoded_addresses`), nunca expostas por rota. Demanda, cursor, supressões e as linhas do
  calendário seguem por empresa.
- **D2 — Identidade `(escopo, ibge, data)`.** O `id` do fornecedor (`external_id`) é só rastro.
- **D3 — Digitada vence; gerada por regra também vence a importada** (`ON CONFLICT DO NOTHING`). Vale para a linha que
  já existe: regra criada depois de uma importada no mesmo dia convive com ela (o dia conta uma vez).
- **D4 — Nacional não é importado.** Uma busca por ano só para conferir paridade com o calendário do código; as
  diferenças são contadas (`national_mismatch`), nunca gravadas.
- **D5 — `FACULTATIVO` só no cache**, não aplicado (Carnaval e Corpus Christi seguem como a 238 decidiu).
- **D6 — Estadual vira `state_holidays` `once` marcado**, pulado se já há `yearly` digitado no mesmo dia e mês.
- **D7 — Só datas de hoje em diante** (dia civil de São Paulo, relógio injetado): o **estado** do selo de prazo de
  nota já entregue não muda (só a contagem de dias de atraso da nota entregue **hoje** pode cair em 1, e fica mais
  certa); desligar importada só vale de hoje em diante.
- **D8 — Horizonte:** ano corrente e o seguinte; par já buscado é rebuscado depois de 180 dias.
- **D9 — Limitador:** 1,2 s entre requisições (~50/min), teto de 100 por ciclo, orçamento mensal no banco (upsert,
  incrementado antes da chamada), rotina 1×/dia (86.400 s em `job_schedules`) com piso de 3.600 s
  (`minimumIntervalSeconds` do catálogo); a trava de uma execução por rotina já existe.
- **D10 — Token só no worker**, opcional; vazio = ausente = rotina não registrada, boot verde.
- **D11 — O aviso fala da cidade, não da exceção do cliente**: pede para conferir, nunca bloqueia.
- **D12 — O aviso do motorista vem pronto da API, na leitura que o app já faz** (`GET /me/trips/current`), como campo
  aditivo `holidayWarnings` por parada. A data é o dia civil de São Paulo do `estimated_arrival_at` da parada, ou
  **hoje** quando a parada já está em andamento (`enRouteSince` ou `arrivedAt` preenchido e `completedAt` nulo);
  parada concluída não tem aviso. A cidade é o 1º segmento da `addressKey`; a regra é a mesma do painel (`explainDay`
  do calendário da cidade do destino físico). Sem rota nova para o app (o aviso viaja no snapshot guardado no
  aparelho e funciona sem rede), e a resposta traz `cityName` para o texto dizer "em Campinas" sem o app consultar
  nada. A nota do motorista **não** lê o calendário.
- **D13 — A rotina nasce pausada de fábrica** (validação, T0.1): sem token cada janela diária fecharia
  `unexpected_error` com `job_run_routine_missing`; a linha de `job_schedules` nasce `enabled = false`,
  `paused_origin = 'system'`, e despausar é passo do usuário junto com o token.

## Requisitos funcionais

- **RF1 — Roteirizador por cidade da parada.** `readPoolWindows` traz `cityIbgeCode` no select de
  `municipal_holidays` e resolve a janela por `(cidade da parada, CNPJ)` (chave `${cityCode}\u0000${taxId}`). A política
  `delivery-window.policy.ts` e o contrato com o solver não mudam; sem migration e sem consulta nova. **Feito**
  (`4454228ac`, `drizzle-pool-window.query.ts` + `pool-window.policy.ts`).
- **RF2 — Modelo de dados** (migration aditiva única, `rollback.sql`, só staging; ADR-0100 §3, com **todos os nomes
  de constraint e índice explícitos e ≤ 63 bytes**): cache global `holiday_provider_fetches` (nacional com
  `ibge_code = 'BR'`), `holiday_provider_entries`, `holiday_provider_monthly_usage`; por empresa
  `holiday_import_cities`, `company_holiday_import_settings`, `holiday_import_suppressions`; `provider_entry_id uuid
null` em `municipal_holidays` e `state_holidays` (FK composta `(id, ibge, data)` para o cache, `RESTRICT`), CHECK de exclusão mútua com
  `source_rule_id`, CHECK de importada só `once` no estadual, índices parciais; o nome da rotina nas duas CHECK de `job`
  e uma linha **pausada de fábrica** em `job_schedules` (D13).
- **RF3 — Catálogo de jobs:** `holiday.provider.pull` nas quatro cópias (API, worker, cron, painel), **painel primeiro**.
- **RF4 — Cliente HTTP** da FeriadosAPI no worker: `Authorization: Bearer`, guarda Zod com as chaves esperadas, erros
  tipados (`provider_unreachable`, `provider_unauthorized`, `malformed_response`), fixture no formato da documentação.
- **RF5 — Descoberta:** cursor por empresa sobre `nfe_documents_company_updated_issued_id_idx`, lotes de até 2.000
  notas, até 20 lotes por ciclo, destino físico pela mesma junção do roteirizador (SQL dos dois papéis + a escolha
  por `resolvePhysicalDestination` em TypeScript, nunca `COALESCE`), upsert em `holiday_import_cities`. O desvio manual
  não entra (como no roteirizador; ADR-0100 §5).
- **RF6 — Busca:** pares `(cidade, ano)` pendentes ou vencidos por `sum(document_count)` decrescente; uma requisição
  por par (`GET /feriados/cidade/{ibge}?ano=Y&limit=100`); paginação só se > 100; nacional 1 por ano só para
  paridade; estadual só se a cidade não o trouxer. Limitador e orçamento do D9; tratamento de erro do ADR-0100 §5.
- **RF7 — Aplicação:** SQL por conjunto. `MUNICIPAL` → `municipal_holidays ON CONFLICT DO NOTHING`, pulando as
  suprimidas; `ESTADUAL` → `state_holidays` `once` marcado (D6), com o `ON CONFLICT` sobre o único parcial `once`;
  só datas `>=` hoje em São Paulo (D7). Data removida pelo fornecedor: `removed_at` no cache, a linha da empresa fica e
  é sinalizada.
- **RF8 — Chave e configuração:** `FERIADOS_API_TOKEN` e `FERIADOS_API_MONTHLY_REQUEST_BUDGET` no schema do worker
  (opcionais; vazio = ausente; molde `GOOGLE_MAPS_API_KEY`); `.env.example` sem valor; `.railway/railway.ts` com
  `preserve()`; registro condicional da rotina; `job_run_routine_missing` sem token.
- **RF9 — Rotas de gestão** (`settings.manage`, Zod `.strict()`, `companyId` do contexto, `audit_logs` na mesma
  transação): desligar (só de hoje em diante) e restaurar um feriado importado, adotar (editar nome/tipo vira
  digitada), status da importação (cidades cobertas/pendentes, último ciclo, orçamento usado no mês, falhas, removidos
  pelo fornecedor). As rotas da 238 passam a tratar a importada (municipal e estadual): `DELETE` **é** o desligar (com
  supressão), `POST` da mesma data e `PATCH` são adoção (zeram `provider_entry_id`), e `typedHolidaysKept` conta só
  `provider_entry_id IS NULL` (ADR-0100 §4).
- **RF10 — Avisos na API:** `GET /trips/:id` ganha nas paradas o campo **aditivo**
  `holidayWarnings` (formato em RF10b; paradas não concluídas, `trip_stops.estimated_arrival_at` em
  dia civil de São Paulo), reaproveitando o calendário da 236; `POST /business-calendar/day-checks` (`fleet.read`,
  corpo `.strict()`, até 200 itens `{ cityIbgeCode, date }`, responde só os dias não úteis por feriado).
- **RF10b — Formato único do aviso:** `{ date, cityIbgeCode, cityName, reasons[] }`, com `cityName` lido do mesmo
  endereço do destino físico que dá o código (`nfe_addresses.city` pela escolha de `listStopAddresses`; nulo quando o
  `city_code` do endereço não é a cidade da parada, como no desvio manual → o texto omite a cidade) e `reasons[]` com
  escopo (nacional, estadual, municipal), origem (código, cadastrado, gerado por regra, importado) e nome. A origem é
  campo novo do calendário (`HolidayReason` hoje só tem o escopo). O mesmo formato serve o detalhe da viagem e o app do
  motorista.
- **RF11 — Painel:** aba Calendário com a origem (nacional, estadual, cadastrado, importado), desligar/restaurar,
  removidos pelo fornecedor e status; avisos por parada na montagem (uma chamada a `day-checks` depois que o solver
  termina; se falhar, o aviso nacional de hoje) e selo nas paradas do detalhe. Locale pt-BR/en, tokens, dois temas.
- **RF13 — Aviso na leitura do motorista:** `GET /me/trips/current` ganha `holidayWarnings` nas paradas (D12, RF10b).
  Recorte pelo vínculo do motorista intacto (BOLA). Calendário das cidades das paradas carregado **uma vez**, em série,
  **+5 consultas fixas** sobre a contagem atual da leitura (4 do calendário + 1 dos endereços para o `cityName`, que a
  leitura do motorista hoje não lê; medida e fixada em contrato antes do código), sem N+1. Falha ao carregar não
  derruba a leitura: sai sem aviso, com log só de ids e contagem. O módulo do aviso é chamado pelo caso de uso, nunca
  pelo repositório da leitura, e não importa `trip-delivery-deadline-*` (contrato de isolamento da 236).
- **RF14 — App do motorista:** a guarda da resposta (`driverTripResponse.validation.ts`) lê `holidayWarnings` como
  acessório (ausente ou malformado → lista vazia, nunca recusa da viagem) e o guarda no snapshot; o cartão da parada
  mostra o aviso ("Hoje é feriado em Campinas (aniversário da cidade). Confirme com o cliente antes de ir."), neutro,
  sem esconder nem bloquear iniciar trajeto, chegar, entregar ou registrar ocorrência; contraste nos dois temas; alvo
  ≥ 44 px se houver toque; pt-BR/en no padrão do app; nenhum código importado do painel (ADR-0075). "Hoje" só quando
  a data do aviso é o dia civil de São Paulo no relógio do aparelho, corrigido pelo desvio que o app já mede
  (`clockOffset.service.ts`); senão a data ("Dia 13/10 é feriado em …").
- **RF12 — Última tarefa:** revisão de design e usabilidade com print (web.md §15), documentação viva e revisão final.

## Requisitos não funcionais

- **Isolamento:** o cache global nunca é exposto por rota; para fora sai só código IBGE e ano (nunca `companyId`).
- **Segredo:** o token nunca aparece em log, resposta, auditoria ou repositório; o header `Authorization` é redigido
  (contrato).
- **Falha nunca derruba o negócio:** pior caso é feriado não importado (o estado de hoje). Fornecedor fora do ar não
  atrasa importação de NF-e, roteirização ou emissão.
- **Sem N+1:** o detalhe da viagem soma +0 consultas quando o calendário da 236 já foi carregado, senão +4 fixas, em
  série (ADR-0096 §6), e o `cityName` sai dos endereços que ele já lê; `day-checks` +4 fixas para até 200 itens; a
  leitura do motorista +5 fixas (RF13).
- **Relógio injetado** em toda decisão de data (D7, D8, backoff, mês do orçamento).
- **Compatível para trás:** cliente que não conhece `holidayWarnings` segue igual; o painel e o app do motorista
  toleram o campo ausente. O campo é de **resposta**: a regra do `apps/api-transportada/CLAUDE.md` ("`.strict()` exige
  API antes do app") vale para corpo de **requisição**; aqui a ordem é a inversa — clientes tolerantes primeiro, API
  depois. A guarda do app já escolhe campo a campo (`toStop`) e ignora o desconhecido; a T5.1b só passa a ler o novo
  sem nunca recusar por ele.
- **A nota do motorista não muda com feriado:** `computeDriverScore`, a pontualidade do comprovante e
  `missingAfterHours` não leem o calendário nem o aviso (contrato de isolamento, como a 236 CA6).
- **Offline no app do motorista:** o aviso é parte do snapshot guardado (24 h, dono por `SHA-256(sub)`, ADR-0075 §8);
  sem rede mostra o último conhecido, nunca calcula nem inventa.

## Casos extremos e falhas

- Sem token: rotina não registrada, boot verde, nenhuma requisição; a linha nasce pausada (D13), então não há janela
  `job_run_routine_missing` diária. Despausada sem token: `job_run_routine_missing` e `unexpected_error`, como hoje
  com as outras rotinas opcionais.
- Primeiro pedido do mês: o contador nasce no upsert (nunca um `UPDATE` sem linha que pararia a rotina).
- Duas entradas do fornecedor no mesmo dia e cidade (facultativo e municipal): vence a não facultativa.
- 401: ciclo encerra com `provider_unauthorized`, nenhuma requisição a mais (402/403 numa cidade restringem só o par,
  `provider_plan_restricted`, e o ciclo segue — 2ª rodada da Fase 3, ADR-0100 §5).
- 429: ciclo encerra e o próximo respeita `Retry-After`.
- Orçamento mensal atingido: o ciclo encerra e **nenhum par muda** (revisto na 2ª rodada da Fase 3; antes os pares
  ficavam `quota_exhausted`); não é falha.
- 404 ou cidade fora da cobertura: `not_covered`, nova tentativa em 90 dias.
- 5xx/timeout: backoff 1 h, 6 h, 24 h, até 7 dias.
- Resposta fora do formato: `malformed_response`, nada gravado daquele par.
- Mesma data digitada e importada: fica a digitada, com o nome dela.
- Feriado desligado: não volta no ciclo seguinte; restaurado, volta.
- Data removida pelo fornecedor: a linha da empresa fica, sinalizada.
- Mesmo CNPJ com paradas em duas cidades no mesmo roteiro: o feriado de uma não fecha a outra.
- Parada sem `estimatedArrivalAt`: sem aviso (ausência é ausência).
- Cidade sem código IBGE válido: sem aviso, nunca "assume" calendário (ADR-0096 §4).
- Parada do motorista em andamento num dia de feriado com ETA de ontem: a data do aviso é **hoje** (D12).
- App do motorista sem rede com snapshot de ontem: o aviso mostra a data dele, não "hoje" (RF14).
- Calendário indisponível na leitura do motorista: viagem sai inteira, sem aviso.

## Critérios de aceite

- **CA1** Feriado em B fecha só as paradas de B, inclusive com o mesmo CNPJ com parada em A; tirar o filtro por cidade
  (mutação) deixa o teste vermelho.
- **CA2** A migration sobe e desce (`make migration-test`); `db:generate` = `no_changes`; a integração do roteirizador
  segue verde depois dela.
- **CA3** Com fornecedor falso, 3 cidades × 2 anos = **6 requisições** espaçadas **≥ 1,2 s** (relógio injetado);
  repetir o ciclo dá **0 requisições e 0 escritas**.
- **CA4** Data digitada mantém o nome e a importada do mesmo dia não é gravada; a gerada por regra também vence.
- **CA5** Desligar grava `audit_logs` com o ator e o feriado não volta no ciclo seguinte; restaurar faz voltar.
- **CA6** Data removida pelo fornecedor continua na empresa, sinalizada (`removed_at` no cache).
- **CA7** 401 encerra com `provider_unauthorized` sem nova requisição; 429 espera o `Retry-After`; o orçamento mensal
  nunca é ultrapassado (contador incrementado antes da chamada).
- **CA8** Sem token: rotina não registrada e boot verde; a linha de `job_schedules` nasce pausada de fábrica
  (`paused_origin = 'system'`); despausada sem token, `job_run_routine_missing`.
- **CA9** O token não aparece em nenhuma linha de log (contrato sobre a saída do logger, inclusive em erro).
- **CA10** `FACULTATIVO` e `NACIONAL` não são aplicados; a diferença nacional é contada em `national_mismatch`.
- **CA11** Data passada não entra; o selo da 236 de nota já entregue não muda.
- **CA12** O detalhe da viagem avisa só a parada da cidade em feriado, com +0 consultas (calendário já carregado) ou
  +4 fixas (contrato de contagem de consultas).
- **CA13** `day-checks` responde 400 a campo desconhecido e a mais de 200 itens, e nunca aceita `companyId` do corpo.
- **CA14** O aviso nunca desabilita "Criar viagem"; prints em 375/768/1280 px, claro e escuro, aprovados pelo usuário.
- **CA15** O motorista vê o aviso **só nas paradas da cidade em feriado** e **só da viagem dele** (outro motorista,
  outra viagem ou outra empresa não recebem); a leitura soma **+5 consultas fixas** com uma cidade ou com várias; o
  aviso nunca esconde nem desabilita ação do app; prints 375/768/1280, claro e escuro, aprovados pelo usuário.
- **CA16** A nota do motorista (`computeDriverScore`), a pontualidade do comprovante e `missingAfterHours` são
  **idênticos** com e sem feriado na cidade da parada (integração); a mutação "a nota desconta o feriado" derruba o
  teste.
- **CA17** O aviso funciona **offline**: com o snapshot guardado e sem rede, o app mostra o último aviso conhecido;
  resposta com `holidayWarnings` malformado ou ausente não derruba a viagem.

## Fora do escopo

- O roteirizador continuar sem ler feriado estadual e nacional (RF4 da 238).
- O **dia UTC** do roteirizador: depois das 21 h em Brasília o "dia" vira o seguinte. Risco registrado; outra spec.
- Importar o país inteiro (só as cidades de destino das notas).
- O CSV manual da 238 (P3).
- O aviso no portal do contratante.
- O módulo legado `driver-trip` do painel (`/minha-viagem`, em drenagem até a remoção da spec 189 Fase 10): tolera o
  campo novo (a guarda escolhe campo a campo) e não ganha o aviso.
- Aviso na seleção de notas (Q5: não existe data ainda).
- Produção (exige aprovação própria, Q2).

## Riscos

- **Termos de uso desconhecidos** (Q4): mitigado por não ligar a rotina sem a confirmação do usuário.
- **Cota sem preço conhecido** (Q3): orçamento mensal no banco, teto por ciclo e prioridade por volume de notas.
- **Contrato do fornecedor muda:** guarda Zod, nada gravado, falha visível no status.
- **Dado errado do fornecedor:** origem visível, desligar com auditoria, D7.
- **Aniversário de cidade pode não vir** (a documentação não o menciona): o cadastro manual da 238 continua valendo.
- **Migration em tabela publicada** (`municipal_holidays`, `state_holidays`): `ADD COLUMN` nulo e CHECK `NOT VALID` +
  `VALIDATE`; lock retido até o `COMMIT` do lote (ADR-0096 §5) — medir antes de produção.
- **Junção da descoberta sem índice:** `nfe_addresses` não tem índice por `(company_id, participant_id)`; a T3.2 mede
  o lote com `EXPLAIN` e, se preciso, o índice sai em migration própria (`CONCURRENTLY`).
- **Migrations paralelas:** a da 250 (`20261007205304_nfse_national_taxation`) entrou em staging durante a T0; a da
  252 nasce depois da última de staging na hora de gerar e é regerada se outra entrar antes (cadeia do `snapshot.json`).
