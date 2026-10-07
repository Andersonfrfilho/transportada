# ADR 0100 — Os feriados vêm da FeriadosAPI e avisam na montagem

- **Status:** proposta (aceita para staging; produção exige aprovação humana própria)
- **Data:** 2026-10-07
- **Nasce da spec 252** (T0.1)
- **Emenda:** ADR-0048 §3 ("nenhuma fonte pública de feriado municipal é confiável") e o "Fora do escopo" da spec 238
  ("importar feriados de fonte pública … nunca carga automática")
- **Citações:** ADR-0021, ADR-0044 §3, ADR-0048 §3, ADR-0062, ADR-0094, ADR-0096, specs 060, 073, 186, 236, 237, 238

## Contexto

O calendário de dias úteis da 238 (ADR-0096) conta feriado nacional (no código), estadual (`state_holidays`) e
municipal (`municipal_holidays` + `municipal_holiday_rules`). Os dois últimos só entram **à mão**: o ADR-0048 §3
decidiu em 2026-08-27 que "nenhuma fonte pública de feriado municipal é confiável o bastante para virar dependência",
e a 238 repetiu a exclusão. Na prática a base fica vazia: a amostra local de NF-e tem **67 cidades de destino
distintas**, todas em SP, nenhuma capital, e ninguém digitou o feriado de nenhuma delas. Sem o feriado da cidade, o
prazo da 236 conta dia útil a mais e a montagem não avisa a entrega marcada para uma cidade fechada.

O usuário decidiu em 2026-10-07 puxar os feriados da **FeriadosAPI** (`https://feriadosapi.com`), aos poucos e
respeitando o limite, gravando no nosso banco, até cobrir as cidades **de destino das notas que já temos** (destino
físico de `resolvePhysicalDestination`, spec 073), e que os feriados importados **avisem na montagem e no detalhe da
viagem**.

Antes disso existe um defeito que a importação tornaria visível: o roteirizador
(`readPoolWindows`, `apps/worker-transportada/src/routing/infrastructure/drizzle-route-optimization.repository.ts`
~1050–1076) busca só `holidayOn` das cidades do roteiro e entrega a **mesma** lista a todos os clientes. O feriado da
cidade B fecha o cliente da cidade A. Está fixado como "comportamento atual" em
`apps/worker-transportada/test/route-optimization-municipal-holiday.integration.test.ts` ~199–206. Com ~4 feriados por
cidade e 20 cidades por roteiro, cerca de 1 dia útil em 5 fecharia todos os clientes do roteiro.

**A FeriadosAPI, pela documentação pública:** `Authorization: Bearer <chave>`; `GET /api/v1/feriados/nacionais?ano=`,
`/api/v1/feriados/estado/{uf}?ano=`, `/api/v1/feriados/cidade/{ibge}?ano=`; `GET /api/v1/estados`, `/municipios`,
`/municipio/{ibge}`. Resposta com `id`, `data` (`DD/MM/AAAA`), `nome`, `tipo` (`NACIONAL` | `ESTADUAL` | `MUNICIPAL` |
`FACULTATIVO`), `descricao`, `uf`, `codigo_ibge`, `bancario`; paginação `page`/`limit` (máx. 100) e `facultativos`.
Limite de 60 req/min no gratuito e no Developer. O gratuito cobre nacionais, estaduais e as 27 capitais; as demais
cidades "consomem cota" (a documentação não diz quanto). O plano Developer custa R$ 39/mês com 5.000 consultas/mês. A
página de termos de uso respondeu 404 e a documentação **não diz se os dados podem ser guardados**.

## Decisão

### 1. A ordem: primeiro o roteirizador, depois a importação

A rotina só grava em `municipal_holidays` **depois** de a correção do roteirizador estar em staging (spec 252 Fase 1).
A correção é mínima: o select traz `cityIbgeCode`, e a janela passa a ser resolvida por `(cidade da parada, CNPJ)`
(chave `${cityCode}\u0000${taxId}`). A política `delivery-window.policy.ts` e o contrato com o solver não mudam; sem
migration e sem consulta nova. O teste de caracterização passa a esperar `[CITY_B]` e ganha o caso do mesmo CNPJ com
paradas em duas cidades.

### 2. As decisões por delegação (D1–D12, revogáveis pelo usuário)

- **D1 — Cache global do fornecedor, efeito por empresa.** O que a FeriadosAPI responde é fato público e vai para
  tabelas **sem `company_id`** (precedente: `geocoded_addresses`), nunca expostas por rota; pagar duas vezes a mesma
  cidade seria desperdício de cota. O que vale para a empresa (demanda de cidades, cursor, supressões, linhas em
  `municipal_holidays`/`state_holidays`) continua com `company_id` e o isolamento multiempresa intacto.
- **D2 — Identidade do feriado é `(escopo, ibge, data)`.** O `id` do fornecedor (`external_id`) é só rastro: se ele
  renumerar, nada se duplica.
- **D3 — A linha digitada vence; a gerada por regra também vence a importada.** A aplicação é
  `INSERT … ON CONFLICT (company_id, city_ibge_code, holiday_on) DO NOTHING`, como a geração da 238 (ADR-0096 §6.1).
- **D4 — Nacional não é importado.** O calendário nacional mora no código (ADR-0096 §2–3). A rotina busca a lista
  nacional uma vez por ano só para **conferir paridade** e conta as diferenças (`national_mismatch`), sem gravar.
- **D5 — `FACULTATIVO` fica só no cache**, não é aplicado. A 238 já trata Carnaval e Corpus Christi como feriado no
  código; isso não muda.
- **D6 — Estadual vai para `state_holidays` como `once`, marcado com a origem**, e é pulado quando já há um `yearly`
  digitado no mesmo dia e mês.
- **D7 — Só datas de hoje em diante entram em vigor** (dia civil de `America/Sao_Paulo`, relógio injetado). Data
  passada não é gravada: o selo de prazo da 236 de nota já entregue não muda por causa da importação.
- **D8 — Horizonte: ano corrente e o seguinte.** Par `(cidade, ano)` já buscado é rebuscado depois de 180 dias.
- **D9 — Limitador:** espaçamento fixo de 1,2 s entre requisições (~50/min, abaixo dos 60), teto de 100 requisições
  por ciclo, orçamento mensal no banco (`FERIADOS_API_MONTHLY_REQUEST_BUDGET`), rotina agendada 1×/dia com piso de
  3.600 s; a trava de uma execução aberta por rotina (`job_executions_open_unique`) já impede duas instâncias.
- **D10 — O token mora só no worker** (`FERIADOS_API_TOKEN`, opcional; vazio = ausente = rotina não registrada e boot
  verde, molde `GOOGLE_MAPS_API_KEY`/ADR-0062).
- **D11 — O aviso fala da cidade, não da exceção do cliente.** "Feriado em Campinas" não sabe se aquele CD abre; o
  texto pede para conferir, nunca bloqueia (a exceção do cliente continua vencendo o feriado no roteirizador, ADR-0048
  §3).
- **D12 — O aviso também chega ao app do motorista, pronto, na leitura que ele já faz.** Pedido do usuário em
  2026-10-07 ("e o aviso no app do motorista também"); a forma é delegação. `GET /me/trips/current` ganha
  `holidayWarnings` por parada (§6); sem rota nova, o aviso viaja no snapshot guardado no aparelho e funciona sem rede.
  Para o motorista, a data é a do `estimated_arrival_at` da parada em dia civil de São Paulo, ou **hoje** quando a
  parada já está em andamento; parada concluída não tem aviso. A nota do motorista não lê o calendário.

### 3. Modelo de dados (uma migration aditiva, com `rollback.sql`, só staging)

**Cache global (sem `company_id`):**

- `holiday_provider_fetches` — `scope` (`city` | `state` | `national`), `ibge_code`, `year`, `status` (`pending` |
  `done` | `failed` | `quota_exhausted` | `not_covered`), `attempts`, `last_error_code`, `next_attempt_at`,
  `fetched_at`; único `(scope, ibge_code, year)`.
- `holiday_provider_entries` — `id`, `scope`, `ibge_code`, `holiday_on`, `name`, `provider_type`, `external_id`,
  `is_banking`, `first_seen_at`, `last_seen_at`, `removed_at`; único `(scope, ibge_code, holiday_on)`.
- `holiday_provider_monthly_usage` — `month`, `requests`.

**Por empresa:**

- `holiday_import_cities` — `company_id`, `city_ibge_code`, `document_count` (aproximado, serve para ordenar),
  `last_seen_at`: a demanda.
- `company_holiday_import_settings` — `company_id`, `is_enabled` (padrão `true`), `cursor_updated_at`,
  `cursor_issued_at`, `cursor_document_id`.
- `holiday_import_suppressions` — `company_id`, `scope`, `ibge_code`, `holiday_on`, `suppressed_by`, `suppressed_at`;
  único `(company_id, scope, ibge_code, holiday_on)`.

**Em tabelas já publicadas:** `municipal_holidays.provider_entry_id uuid null` e `state_holidays.provider_entry_id uuid
null`; CHECK de que `source_rule_id` e `provider_entry_id` nunca vêm os dois em `municipal_holidays`; índice parcial
`provider_entry_id is not null`. O nome da rotina entra nas CHECK de `job` de `job_schedules` e `job_executions` e
ganha linha em `job_schedules` (molde `20261007133324_cargo_preview_retention`). O roteirizador continua lendo
`municipal_holidays` por data fixa: **o contrato dele não muda**, e ele nunca lê o cache.

A leitura da política (`loadBusinessCalendarRules`) já trata a linha com `source_rule_id` nulo como `once`; a linha
importada entra assim, sem mudar a consulta.

### 4. Convivência das linhas

1. Digitada vence; gerada por regra vence a importada (D3).
2. **Desligar** um feriado importado apaga a linha, grava `holiday_import_suppressions` e `audit_logs` (ator) e ele
   **não volta** no ciclo seguinte. **Restaurar** apaga a supressão e o feriado volta no ciclo seguinte (ou na hora,
   se o cache já o tem).
3. **Editar nome ou tipo** de uma importada é **adoção**: `provider_entry_id = null`, a linha vira digitada (mesmo
   raciocínio do ADR-0096 §6.4).
4. Quando o fornecedor **remove** uma data, `removed_at` é marcado no cache e a linha da empresa **fica**, sinalizada
   para o operador decidir. Nada é apagado em silêncio.

### 5. A rotina `holiday.provider.pull`

Cron → fila → worker, molde `cargo-preview.retention.apply`, nas quatro cópias do catálogo de jobs (API, worker, cron,
painel; painel primeiro). Três etapas idempotentes por ciclo:

1. **Descoberta (só banco).** Cursor por empresa sobre o índice `nfe_documents_company_updated_issued_id_idx`, até
   2.000 notas por lote e 20 lotes por ciclo; resolve o destino físico com a mesma junção do roteirizador e faz
   upsert em `holiday_import_cities`.
2. **Busca (HTTP).** Pares `(cidade, ano)` pendentes ou vencidos, por `sum(document_count)` decrescente; uma
   requisição por par (`GET /feriados/cidade/{ibge}?ano=Y&limit=100`, paginação só se vier mais de 100). Nacional: 1
   por ano, só paridade (D4). Estadual só se a resposta da cidade não trouxer os estaduais.
3. **Aplicação (só banco, SQL por conjunto).** `MUNICIPAL` → `municipal_holidays … ON CONFLICT DO NOTHING`, pulando as
   suprimidas; `ESTADUAL` → `state_holidays` `once` marcado (D6); só datas `>=` hoje em São Paulo (D7).

**Erros:** 401/403 encerram o ciclo com `provider_unauthorized` sem nova requisição; 429 encerra e respeita
`Retry-After`; cota esgotada marca `quota_exhausted` até o dia 1º (não é falha); 404 ou fora da cobertura marca
`not_covered` e retenta em 90 dias; 5xx/timeout → backoff 1 h, 6 h, 24 h, até 7 dias; resposta fora do formato
(guarda Zod com as chaves esperadas) → `malformed_response`, nada gravado. Vocabulário de falha:
`provider_unreachable`, `provider_unauthorized`, `malformed_response`. O contador mensal é incrementado **antes** de
cada chamada e a rotina para ao atingir o orçamento.

**Estimativa (amostra local):** carga inicial ≈ 138 requisições (67 cidades × 2 anos = 134, mais 2 de paridade nacional e
2 estaduais de SP, se a resposta da cidade não os trouxer), ≈ 3 min, em 2 ciclos de 100; manutenção ≈ 25/mês.

### 6. Os avisos

- **A data da entrega** é o `estimatedArrivalAt` de cada parada da sugestão (montagem) e o
  `trip_stops.estimated_arrival_at` das paradas não concluídas (detalhe), convertidos para dia civil em
  `America/Sao_Paulo`. A viagem não tem data planejada própria.
- **A cidade** é o 1º segmento da `addressKey` da parada (`trips/domain/stop-address-key.ts`), que já é o destino
  físico.
- **A regra** é o `explainDay` do calendário da cidade (municipal digitado, gerado ou importado; estadual; nacional):
  avisa quando o dia não é útil **por feriado**. Fim de semana segue no aviso que já existe.
- **O formato** só informa e nunca desabilita "Criar viagem", com a origem marcada (nacional, estadual, cadastrado,
  importado): "Entrega prevista ter 13/10 em Campinas: feriado municipal — Aniversário (importado). Confira se o
  cliente recebe."
- **Formato único:** `{ date, cityIbgeCode, cityName, reasons[] }` — `cityName` do mesmo endereço do destino físico
  que dá o código (nulo → o texto omite a cidade); `reasons[]` com escopo, origem e nome. Serve o painel e o app do
  motorista.
- **API:** `GET /trips/:id` ganha nas paradas o campo **aditivo** `holidayWarnings` nesse formato,
  reaproveitando o calendário que a 236 já carrega (+0 consultas quando já carregado; senão +4 fixas, em série, sem
  N+1). `POST /business-calendar/day-checks` serve a montagem (a sugestão é efêmera): corpo `.strict()` com até 200
  itens `{ cityIbgeCode, date }`, `companyId` do contexto, responde só os dias não úteis, +4 consultas fixas. O painel
  chama **uma vez**, depois que o solver termina; se a rota falhar, cai no aviso nacional de hoje.
- **App do motorista** (`apps/frontend-driver`, app separada, ADR-0075): `GET /me/trips/current` ganha
  `holidayWarnings` nas paradas, com o recorte pelo vínculo do motorista intacto (ele só vê a viagem dele). O
  calendário das cidades das paradas é carregado **uma vez**, em série, **+4 consultas fixas** sobre a contagem atual
  da leitura (medida e fixada em contrato antes do código); falha ao carregar não derruba a leitura, só tira o aviso.
  A guarda do app (`driverTripResponse.validation.ts`) escolhe campo a campo e já ignora o desconhecido; ela passa a
  ler o aviso como **acessório** (ausente ou malformado → lista vazia, nunca recusa da viagem) e o guarda no snapshot
  do aparelho. Texto curto de campo ("Hoje é feriado em Campinas (aniversário da cidade). Confirme com o cliente
  antes de ir."), "hoje" só quando a data do aviso é o dia civil do aparelho; nunca esconde nem bloqueia iniciar
  trajeto, chegar, entregar ou registrar ocorrência. Sem rede, mostra o último aviso conhecido e não inventa. Nada é
  importado do painel. **Não-regressão:** `computeDriverScore`, a pontualidade do comprovante e `missingAfterHours`
  não leem o calendário nem o aviso (contrato de isolamento, como a 236 CA6).
- **Ordem de publicação:** painel tolerante e app do motorista tolerante → API → telas. O campo é de **resposta**: a
  regra "`.strict()` exige API antes do app" do `apps/api-transportada/CLAUDE.md` vale para corpo de requisição, e
  aqui a ordem é a inversa.

## Consequências

- O calendário passa a ter feriado municipal sem digitação, e o prazo da 236 deixa de contar dia útil a mais nas
  cidades cobertas.
- O produto ganha um **destino de saída** novo (`feriadosapi.com`) e um custo recorrente possível (plano Developer).
- O cache global é a primeira tabela de dado de terceiro sem `company_id` desde `geocoded_addresses`; ela nunca é
  exposta por rota.
- Falha do fornecedor nunca derruba nada do negócio: o pior caso é feriado não importado, que é o estado de hoje.
- O roteirizador deixa de fechar clientes de uma cidade pelo feriado de outra — correção que vale mesmo sem a
  importação.
- O motorista passa a saber, na parada, que a cidade está em feriado, sem rede e sem consulta nova do app; a leitura
  dele custa +4 consultas fixas e a nota dele não muda.

## Riscos

- **Termos de uso desconhecidos** (Q4 da spec 252). A página de termos deu 404 e a documentação não diz se o dado pode
  ser guardado. Registrado em `docs/SECURITY.md` (2026-10-07). **Passo do usuário:** confirmar com o fornecedor
  antes de configurar o token. Precedente de risco aceito por decisão do usuário: termos do Google Maps Platform, spec 186.
- **Cota e plano** (Q3). A documentação não diz quanto uma cidade do interior consome. O orçamento mensal no banco
  impede ultrapassar o número configurado, mas não sabe o preço real de cada chamada.
- **Mudança de contrato do fornecedor.** A guarda Zod recusa a resposta inteira (`malformed_response`) e nada é
  gravado; o operador vê a falha no status da importação.
- **Dado errado do fornecedor.** A origem fica visível ("Importado (FeriadosAPI)"), o operador desliga (com auditoria)
  e a supressão impede a volta; D7 impede que um erro mude o passado.
- **Aniversário de cidade não aparece na documentação** do fornecedor. Se ele não vier, a cidade fica só com o que o
  fornecedor tem; o cadastro manual da 238 continua valendo e vence.
- **O aviso guardado no aparelho envelhece.** O snapshot vale até 24 h (ADR-0075 §8); um aviso calculado ontem pode
  não valer hoje. Por isso o app mostra a data do aviso e só diz "hoje" quando ela é o dia civil do aparelho.
- **Dia UTC no roteirizador** (fora de escopo): depois das 21 h em Brasília, o "dia" do roteiro vira o seguinte. Fica
  para outra spec.

## Alternativas descartadas

| Alternativa                                 | Por que não                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Cache por empresa                           | Paga a mesma cidade uma vez por empresa; o dado é público e não muda por empresa                                        |
| Roteirizador lendo o cache direto           | Muda o contrato congelado do solver e ignora supressão, adoção e a precedência da linha digitada                        |
| Importar o país inteiro (5.571 municípios)  | ~11 mil requisições para cidades onde nunca houve entrega; estoura cota sem benefício                                   |
| Importar sem corrigir o roteirizador antes  | Cada feriado importado fecharia todos os clientes do roteiro, não só os da cidade                                       |
| App do motorista calculando o aviso sozinho | Copiaria o calendário para o app separado (ADR-0075) e divergiria da API; offline sem a lista da cidade                 |
| Rota nova só para o aviso do motorista      | Mais uma chamada no celular e um aviso que some sem rede; a leitura atual já é guardada no aparelho                     |
| Bloquear "Criar viagem" em feriado          | O cliente pode abrir (exceção do cliente, ADR-0048 §3); quem decide é o operador                                        |
| BrasilAPI                                   | Só nacionais (conferido em 2026-10-07: das 14 datas de 2026, 13 batem com o código e a outra é a Páscoa); sem municipal |
| Gravar feriado passado                      | Mudaria o selo de prazo de nota já entregue (236)                                                                       |
| Rotina horária                              | 1×/dia cobre a demanda (≈ 25 requisições/mês de manutenção) e gasta menos cota                                          |

## Emendas

- **ADR-0048 §3** — "Nenhuma fonte pública de feriado municipal é confiável o bastante para virar dependência" deixa de
  valer como proibição: a FeriadosAPI entra como **fonte opcional**, com a linha digitada vencendo, origem visível,
  supressão auditada e falha que nunca derruba o negócio. A frase "alimentado à mão" passa a ser "alimentado à mão e,
  quando configurado, pela importação". O texto histórico do ADR-0048 fica; uma nota no topo aponta para cá.
- **Spec 238, "Fora do escopo"** — "Importar feriados de fonte pública … nunca carga automática" é revogado pela spec
  252 para a FeriadosAPI. O CSV manual (P3 da 238) continua fora. Nota no topo da spec 238 aponta para cá.
