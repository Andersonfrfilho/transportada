# Evidência — 237

## T4.0 (parcial) — comparação planilha × XML reais (2026-10-03)

Corpos: 346 XMLs (07/07–28/08) e 277 XMLs (23/09 e 25/09, `ID1026570_procNFe_parte1`) do mesmo emitente;
planilhas `FR-24-09` (187 linhas), `FR-28-09` (107), `FR-01-10` (191) e `FR-05-10` (194). Os últimos XMLs
(30/09 e 02/10) não foram fornecidos. **Não é a T4.0 completa**: falta o conjunto inteiro de XMLs.

| Medida                                                 | Resultado                                   |
| ------------------------------------------------------ | ------------------------------------------- |
| `Text001` ou `Company` em algum XML                    | **0** (texto bruto, atributos incluídos)    |
| valor + CEP → 1 nota                                   | FR-24-09 **139/187**; FR-28-09 **96/107**   |
| valor + peso → 1 nota                                  | FR-24-09 **146/187**; FR-28-09 **91/107**   |
| ambíguas (valor + CEP)                                 | 0 e 2                                       |
| desvio do peso (`PESO TOTAL` × `pesoB`)                | **0** (mediana e p90)                       |
| cidade igual nos vínculos                              | 139/139                                     |
| nome do destinatário igual                             | 115/139                                     |
| `NroCarga` ↔ `RouteName`                              | **1:1** (10×10 e 8×8)                       |
| `Company` ↔ CNPJ do destinatário                      | **1:1**, 212 códigos, 0 conflitos           |
| e-mail (25/09 16:33) × emissão das 91 notas vinculadas | **todas depois**: 2,7–4,2 h (mediana 2,9 h) |
| lacres / cargas / notas                                | 3 / 18 / 277                                |

Reprodução: ler `infNFe` de cada XML (`ide/nNF`, `ide/dhEmi`, `total/ICMSTot/vNF`, `dest/enderDest/CEP`,
`transp/vol/pesoB`, `infAdic/infCpl`) e cruzar com a aba `IMPORTAÇÃO` (colunas `C`, `D`, `F`, `H`, `M`). O
resultado completo no banco sai de `consulta-recebimento-vs-xml.sql`.

| soma de valor/peso por `RouteName` × por `NroCarga` | igual ao centavo em **8/10** (24/09) e **7/8** (28/09) |
| NF que junta vários pedidos do mesmo cliente | confirmado: soma por cliente fecha em 13/14, 22/24, 23/25, 10/10 |
| `NroCarga` ou lacre em célula das planilhas | **0** (as duas abas, as quatro planilhas) |

## T1.1 — ADR-0094 e o modelo do perfil (2026-10-03)

- **Número:** `git fetch` + `docs/adr/` de `origin/staging` (última: `0093-o-ajudante-e-um-perfil.md`), dos
  worktrees em `.claude/worktrees/*` e `../transportada-wt/*` e de todas as branches de `origin`: nenhum
  `0094+`. ADR: `docs/adr/0094-o-recebimento-da-carga-antes-da-viagem.md`.
- **Revisão `architect` (opus), passada separada, sem editar arquivo:** veredito **APROVADO COM AJUSTES**.
  Acolhidos:
  - **A1** as regras valem para a chegada que ainda vai nascer (a chegada copia `separation_due_at` e o
    prazo; editar o perfil não refaz chegada aberta); `separation_window_hours` nulo = sem relógio.
  - **A2** `PUT` exige **todas** as chaves (`null` explícito): campo omitido é `400`, para um painel em
    cache não apagar uma coluna futura sem erro; reenviar o corpo do `GET` não audita.
  - **A3** (parcial) o padrão continua expressão (o formato do `infCpl` de outro emitente é desconhecido),
    com a regra mínima da revisão: flag `u`, exatamente um grupo de captura, sem quantificador aninhado,
    sem grupo quantificado com alternação, sem referência para trás, sem lookaround. A troca por rótulo
    ficou registrada como alternativa.
  - **A4** `notes` removido (`contractors.notes` já existe); `preview_sheet_name` 1..31; com prévia ligada
    o mapa exige `routeName`, `value`, `weightKg`; coluna repetida comparada normalizada.
  - **A5** texto: `match_window_days`/`weight_tolerance_percent` são parâmetros do algoritmo (`NOT NULL`),
    não regra do contratante.
  - Módulo novo `src/cargo-receiving/`; `GET` com `fleet.read` (como a leitura do contratante), `PUT`
    com `settings.manage`; caminho `/contractors/:id/receiving-profile` (mesma forma de
    `/contractors/:id/contacts`).
- **Divergências do RF1 da spec (registradas no ADR):** `preview_sender_allowlist` adiado para a Fase 4b
  (depende da D6); `grouping` não vira coluna (rota × cidade é decisão fixa do usuário).
- **Agregado `Contractor` não muda:** o perfil é recurso separado; as guardas de chave exata do painel
  não precisam de alteração.

## T1.2 — Migration `contractor_receiving_profiles` (2026-10-03)

- **Contrato antes:** `test/cargo-receiving-schema/contractor-receiving-profile.contract.ts` (registrado no
  `test` do `package.json`) vermelho pelo motivo certo —
  `Export named 'contractorReceivingProfiles' not found` — e verde (5 pass) com o schema.
- **Schema:** `src/database/contractor-receiving-profile.schema.ts`, exportado em `database.schema.ts`.
  FK `(company_id, contractor_id)` → `contractors(company_id, id)` e `company_id` → `companies`, ambas
  `restrict/cascade`; unique `(company_id, contractor_id)`; 8 CHECKs (faixas, `jsonb_typeof = 'object'`,
  prévia ligada exige mapa, tamanho da aba e do padrão).
- **Migration:** `bun run db:generate --name contractor_receiving_profiles` →
  `drizzle/20261003170340_contractor_receiving_profiles/` (só `CREATE TABLE` + 2 FKs na própria tabela).
  `snapshot.json` encadeado: `prevIds = ["eb960c28-…"]`, que é o `id` do snapshot de
  `20261003010806_event_location_whatsapp_coordinate` (nenhum outro snapshot aponta para ele). Depois:
  `bun run db:generate` → `{"status":"no_changes"}`.
- **`rollback.sql` à mão:** `DROP TABLE IF EXISTS` + remoção da entrada do diário, sem `CASCADE`.
- **`make migration-test`:** 1ª rodada vermelha (a lista fixa de pastas do
  `static-migration.contract.ts` não tinha a nova) → pasta acrescentada + teste estático da migration
  (só tabela nova, rollback sem `CASCADE`) → **120 pass, 0 fail** (8 arquivos, Postgres descartável; o
  `database-migration.integration.ts` aplica todos os `rollback.sql` em ordem inversa).
- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato
  `bun --env-file=../../.env.test test --timeout 120000`: **9167 → 9173 pass**, 24 skip, 0 fail (194 → 195
  arquivos) · `bun run format:check` na raiz ✓.
- **Mutação:** CHECK de `separation_window_hours` alargado para `1..9999` → o contrato de faixas reprova
  (4 pass, 1 fail); restaurado → 5 pass.
- `docs/spec/domain-model.md`: agregado `ContractorReceivingProfile` e a constraint unique. O worker
  (`apps/worker-transportada/src/database/delivery-client.schema.ts`) não mudou.

## T1.3 — Rotas do perfil e contrato (2026-10-03)

- **Módulo novo** `apps/api-transportada/src/cargo-receiving/` (domain/application/presentation/
  infrastructure), montado em `src/main.ts` ao lado das rotas do contratante; caminho
  `API_CONTRACTOR_RECEIVING_PROFILE_PATH = '/contractors/:id/receiving-profile'` em
  `src/shared/api.constant.ts`.
  - `GET` (`fleet.read`): `{ data: null }` sem perfil; contratante inexistente ou de outra empresa →
    `404 CONTRACTOR_NOT_FOUND` (reaproveita `ContractorNotFoundError`, o código estável que o
    `/contractors/:id` já devolve).
  - `PUT` (`settings.manage`): Zod `.strict()` com **todas as chaves obrigatórias**; todos os campos
    inválidos voltam juntos em `error.details`; `companyId` e ator só do contexto; upsert idempotente
    em transação, contratante travado com `for no key update`, auditoria em `audit_logs` só quando muda.
- **Contrato antes:** os três entrypoints novos (`cargo-receiving`, `cargo-receiving-http`, mais
  `tenant-safety` no `cargo-receiving-schema`) vermelhos por `Cannot find module …/cargo-receiving/…`
  antes do código.
- **Contrato depois** (`bun --env-file=../../.env.test test --timeout 120000`): **9173 → 9222 pass**, 24
  skip, 0 fail, 195 → 197 arquivos (+26 padrão, +3 caso de uso, +18 HTTP, +2 isolamento). O script
  `test` do `package.json` dá o mesmo total (9246 testes, 197 arquivos): os três entrypoints novos estão
  na lista explícita.
- **Integração** (`bun --env-file=../../.env.test test --timeout 120000
./test/integration/contractor-receiving-profile.integration.ts`, Postgres do `.env.test` em 65432,
  banco descartável migrado): **3 pass, 0 fail, 0 skip** — ausência = `null`; `PUT` cria, repetido
  devolve o mesmo `updatedAt` e não audita, mudado audita (1 → 2 linhas); contratante de outra empresa
  → 404 na leitura e na gravação, sem linha nem auditoria; 8 escritas por fora da API recusadas pelo
  banco com `23514`. Registrado em `test:integration`; `integration-shard.contract.test.ts` 4 pass.
- **Mutações** (aplicadas uma a uma por script, restauradas automaticamente; `git diff` limpo depois):

  | Mutação                                                       | Vermelho                                                              |
  | ------------------------------------------------------------- | --------------------------------------------------------------------- |
  | tirar `contractors.company_id` do filtro do contratante       | isolamento (contrato) 1 fail; integração "outra empresa é 404" 1 fail |
  | tirar o CHECK de `separation_window_hours` da `migration.sql` | integração "faixas valem no banco" 1 fail                             |
  | alargar o CHECK no schema (T1.2)                              | contrato do schema 1 fail                                             |
  | aceitar quantificador aninhado (`(a+)+`)                      | 6 fails no contrato do padrão; HTTP "padrão `(a+)+` é 400" 1 fail     |
  | `PUT` com `fleet.read` no lugar de `settings.manage`          | HTTP "quem só lê a frota … não grava" 1 fail                          |
  | tirar o `.strict()`                                           | HTTP "chave desconhecida e `companyId` no corpo são recusados" 1 fail |
  | `PUT` repetido regrava (sem a comparação canônica)            | integração "repetido não audita" 1 fail                               |
  | aceitar coluna repetida no mapa                               | HTTP "coluna repetida é 400" 1 fail                                   |

- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ · `bun run format:check` na raiz ✓.
- **Não houve "toda rota aparece no documento":** esta API não gera OpenAPI (busca por `openapi`/`scalar`
  no repositório; `docs/ai-context/api-transportada.md` já registrava isso). Nenhum teste a fazer passar.
- **Guardas de chave exata do agregado `Contractor` (painel, 3 cópias):** **não mudam** — o agregado e o
  `PATCH /contractors` não foram tocados; o perfil é recurso separado.
- **"No máximo 20 entradas" no mapa:** coberto por construção — as chaves são fechadas em 13 campos, então
  o limite nunca é alcançável e não ganhou checagem morta.
- **Erro:** esta API não tem `shared/errors/codes.ts` nem `DomainError`; o padrão do repositório é
  `ApiError` por domínio em `*/domain/*.error.ts`. Nenhum código novo foi preciso: 404 reaproveita
  `CONTRACTOR_NOT_FOUND`, e validação é o `400` padrão de `parseBody` com os campos nomeados.
- **Não rodou:** a suíte de integração inteira (`bun run test:integration`, ~17 min) — só o arquivo novo e
  o `make migration-test` (T1.2).
- Documentação viva: `docs/ai-context/api-transportada.md` § "Spec 237" e `apps/api-transportada/CLAUDE.md`.

## T1.4 — aba "Contratantes" em `/clientes` (painel)

- **Contrato antes** (`ac1cdfe91`): vermelho de asserção (51 fail em
  `delivery-clients.contract.test.ts` sobre esqueleto que lança `NOT_IMPLEMENTED`/devolve valor neutro) e,
  em `test:hooks`, 26 fail porque o painel ainda renderizava `null`. Implementação (`d27cd62df`) deixa
  tudo verde. Os arquivos novos entram pelos entrypoints que o script `test` do `package.json` já lista
  (`delivery-clients.contract.test.ts` e `trip-hooks.contract.test.ts`); nenhuma linha nova foi preciso.
- **Contagem final:** `bun run test` **6624 pass / 0 fail** (antes 6569) + `test:hooks` **385 pass / 0 fail**
  (antes 359). `tsc --noEmit` limpo; `eslint` 0 erros (16 avisos preexistentes, nenhum nos arquivos novos).
- **O que a tela faz:** lista (nome, CNPJ formatado, situação, selo lido do perfil), busca por nome/CNPJ,
  ordenação por cabeçalho (asc → desc → neutro), situação com seleção múltipla, "Limpar filtros" só com
  critério, contador `{n} de {total}` com filtro, estado em `?tab=contractors&q&sort&dir&status`. Ficha
  abaixo da lista (mesmo padrão do cliente, com `useRevealedPanel`): dados (`PATCH /contractors/:id`,
  CNPJ só leitura) + perfil de recebimento (`PUT` com as 10 chaves, `null` onde não há regra), grupos
  Recebimento / Prazos / Prévia da planilha / Avançado. Recusa do servidor: "Confira:" com TODOS os campos
  pelo rótulo impresso, cada um é atalho que rola e foca (`data-field`), campo desconhecido sai com o nome
  cru, falha sem campo só mostra o código; `aria-invalid` + `aria-describedby` por campo; editar limpa só o
  erro dele.
- **Mutações** (script em lote, restauração automática; `git status` limpo depois):

  | Mutação                                                     | Vermelho |
  | ----------------------------------------------------------- | -------- |
  | PUT omite uma chave do perfil                               | 3 fail   |
  | campo vazio vira zero em vez de `null`                      | 1 fail   |
  | faixa da janela de separação 168 → 200                      | 1 fail   |
  | ordenação asc → desc → asc (sem neutro)                     | 1 fail   |
  | "Limpar filtros" sempre visível                             | 1 fail   |
  | aviso repete campo (sem dedup)                              | 2 fail   |
  | campo desconhecido some do aviso                            | 2 fail   |
  | atalho do aviso não leva o foco                             | 2 fail   |
  | editar um campo limpa o erro de todos                       | 1 fail   |
  | cliente joga fora os `details` do 400                       | 3 fail   |
  | guarda aceita chave a mais na resposta do perfil            | 1 fail   |
  | URL não leva a situação                                     | 2 fail   |
  | quem só lê ganha os campos editáveis (`isDisabled={false}`) | 1 fail   |
  | coluna repetida deixa de ser recusada                       | 1 fail   |
  | prévia ligada não exige roteiro/valor/peso                  | 1 fail   |
  | busca ignora o CNPJ                                         | 2 fail   |
  | e-mail do relatório sem forma passa                         | 1 fail   |
  | PUT leva `companyId` no corpo                               | 1 fail   |
  | aviso "Confira" sem lista vazia (sem o `return null`)       | 6 fail   |
  | erro do campo sem `aria-invalid`                            | 4 fail   |

  A primeira rodada achou **uma mutação que sobreviveu** (atalho sem foco): o teste clicava no atalho do
  campo que já tinha o foco por ter sido o último digitado. Corrigido para provar o atalho de outro campo,
  e a comparação passou a ser booleana (`activeElement === campo`) — `toBe` sobre nó do DOM não reprovou
  no happy-dom.

- **Defeito achado pelo próprio contrato:** `ContractorDetailsForm` e `ReceivingProfileForm` irmãos com a
  mesma `key` (React avisava "two children with the same key"); chaves removidas, a ficha já é remontada por
  contratante pelo painel.
- **Divergências do pedido:** (1) o painel **não tem zod** (CLAUDE.md da app): a validação é `*.validation.ts`
  manual com as mesmas faixas do servidor, copiadas por valor; (2) o selo "Recebimento ativo / Sem perfil"
  custa **uma leitura de perfil por contratante** (`useQueries`, mesma chave da ficha) porque não existe rota
  em lote — pedir uma é follow-up; (3) o mapa de colunas fica visível com a prévia ligada **ou** com alguma
  coluna já preenchida, para um dado gravado nunca ficar escondido; (4) o "Recebimento" do selo distingue
  "desligado" (perfil existe, `isEnabled=false`) de "sem perfil"; (5) a lista carrega todas as páginas
  (cursor, limite 100) e filtra/ordena no cliente: a API só filtra por nome, não por CNPJ.
- **Revisão de design (web.md §15)** — `spec-237-prints.smoke.spec.ts`, 1280 px escuro, estilo calculado:

  | Medida                  | Vizinho `DeliveryClientForm` | Ficha nova                                             |
  | ----------------------- | ---------------------------- | ------------------------------------------------------ |
  | campo: fundo/borda/raio | asfalto 62% / slate 32% / 0  | idêntico                                               |
  | campo: padding / fonte  | 12px / 14,4px                | 12px / 14,4px                                          |
  | campo: altura           | 57px (esticado pelo grid)    | 48px = `--field-height`                                |
  | ajuda (`.hint`)         | slate, 16px                  | idêntico                                               |
  | botão salvar            | cobre, raio 0, 12×20px       | idêntico (48px; o vizinho estica a 65px)               |
  | cantos do formulário    | 8px (`.form`)                | 8px (mesma classe, por `composes`)                     |
  | legenda do grupo        | —                            | mono 12px, cobre-tinta, caixa alta (igual ao `kicker`) |
  | selo                    | `statusBadge` da frota       | mono 11,5px, borda 1px, tinta do selo                  |

  Dois defeitos achados nos prints e consertados: (a) a coluna "Dados" esticava até a altura do perfil e
  espalhava a sobra entre os campos — `align-items/content: start`; (b) campos lado a lado com alturas
  diferentes (54/58px) pelo mesmo motivo; e (c) o selo "ativo" no tema claro dava 4,38:1 — texto passou a
  usar `--color-*-ink`. Contraste final (WCAG, texto sobre fundo opaco efetivo), escuro / claro: ajuda
  6,22 / 4,83 · rótulo 14,48 / 12,66 · legenda 6,16 / 5,37 · aviso de recusa e erro 5,46 / 4,69 · selo ativo
  6,59 / 5,50 · selo desligado 5,50 / 5,87 · selo sem perfil 6,30 / 5,36 · indicador de ordenação 5,87 / 4,57.
  A 375 px: 10 controles da ficha medidos, o menor tem 44px (≥ 44); nenhuma das três larguras tem scroll
  horizontal (afirmado pelo próprio teste de print).

- **Prints** (24 PNG, `specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints/`, 375/768/1280 × escuro/claro):
  `contratantes-lista-*`, `contratante-ficha-*` (Beta: dados + perfil preenchido), `contratante-ficha-previa-*`
  (Alfa: prévia ligada com o mapa de colunas) e `contratante-ficha-recusa-*` (400 do servidor com 3 campos).
  Gerados por `test/spec-237-prints.smoke.spec.ts` (fora do smoke da CI; build com
  `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária e preview em porta própria, config do Playwright
  descartável — a config da CI não foi tocada). API 100% dublada, dados inventados.
- **Não rodou:** `make smoke`/smoke da CI, `make check` completo (build de produção do painel só foi
  feito para os prints, sem os `assets:*` do `prebuild`), integração da API (nada da API mudou).

## T2.1 — o eixo da nota na chegada e a política pura (2026-10-03)

- **Estado inicial `expected`** (spec "esperada → recebida → separada", ADR-0094 §1): a nota entra na
  chegada sem conferência. `separated` só a partir de `received`; repetir a etapa atual é `unchanged`
  (sem evento); **sem volta** — nem a spec nem o ADR preveem desfazer, então nada foi inventado; chegada
  `closed` recusa tudo. Registrado no ADR-0094 §6.
- **Contrato antes** (`test/cargo-receiving/cargo-arrival-transition.contract.ts` e
  `cargo-arrival-grouping.contract.ts`, no entrypoint `cargo-receiving.contract.test.ts` que o `test` do
  `package.json` já lista): vermelho por `Cannot find module …/cargo-arrival-transition.policy.js`. A
  primeira rodada com o código achou **um erro do próprio teste** (a entrada não tinha o grupo esperado
  `FR.S.CAR × 3548906`), corrigido no teste; o código ficou como estava. Depois: **60 pass, 0 fail**
  (tabela de 12 transições × estado da chegada, relógios, cópia do perfil, folga de 2 min, vencimento,
  agrupamento estável).
- **Código:** `src/cargo-receiving/domain/cargo-arrival-transition.policy.ts` (tabela, decisão,
  `resolveSeparationDueAt`, `copyArrivalRulesFromProfile`, `isArrivedAtTooFarInFuture`,
  `isSeparationOverdue`), `cargo-arrival-grouping.policy.ts` (`groupArrivalDocuments`: rota, cidade, nulos
  por último, número em ordem numérica, empate pelo id) e `src/shared/cargo-arrival.constant.ts` (listas
  lidas pelo domínio e pelos CHECKs, sem puxar `cargo-receiving/` para o pre-deploy).
- **Mutações** (script, restauração automática, `src` limpo depois):

  | Mutação                                        | Vermelho |
  | ---------------------------------------------- | -------- |
  | `expected → separated` permitido (pular etapa) | 2 fail   |
  | sem o no-op (`from === to`)                    | 2 fail   |
  | janela em minutos em vez de horas              | 3 fail   |
  | perfil desligado copia regras                  | 1 fail   |
  | vencida mesmo com tudo separado                | 1 fail   |
  | número da nota comparado como texto            | 1 fail   |
  | rota/cidade nulas no começo                    | 1 fail   |

- **Revisão `architect` (opus), passada separada, sem editar arquivo:** **APROVADO COM AJUSTES**. Acolhidos
  na T2.2/T2.3: (1) toda escrita trava primeiro a chegada (`for no key update`, confere `open`) e depois as
  notas em ordem de id, `no key update`; (2) idempotência com `request_fingerprint` (sha256 do contratante,
  notas ordenadas, `arrivedAt`, paletes, referência), procurada **depois** da trava do contratante e
  **antes** de validar as notas, e `23505` da chave traduzido para 409; (3) CHECK exato
  `extract(epoch from separation_due_at - arrived_at) = separation_window_hours * 3600`; (4) `from_state`/
  `to_state` em coluna nos eventos, `separated_at >= received_at` na nota; (5) evento com FK
  `(company_id, arrival_id, arrival_document_id)` → `unique (company_id, arrival_id, id)` das notas;
  (6) índices: `nfe_participants (company_id, role, tax_id)`, chegada por contratante/data, eventos por
  chegada e por nota; endereço do destinatário por `lateral … limit 1` (sem unique por participante);
  (7) `:documentId` sempre resolvido dentro da chegada; (8) canal em constante própria; (9) rotas novas no
  `separator-role.contract.test.ts`. Limitação do unique simples (sem conserto para nota posta por engano,
  reentrega não entra em outra chegada) escrita no ADR-0094 §6.
- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓. Contrato da suíte inteira no fecho da T2.3.

## T2.2 — migration `cargo_arrivals`, `cargo_arrival_documents`, `cargo_arrival_events` (2026-10-03)

- **Cadeia conferida antes:** `git fetch` → `origin/staging` sem commit novo à frente desta branch; o
  último snapshot era o de `20261003170340_contractor_receiving_profiles` (`id 43e75ad7-…`). Gerada
  `drizzle/20261003204733_cargo_arrivals/` com `prevIds = ["43e75ad7-…"]`, e é o único filho dele. Depois:
  `bun run db:generate` → `{"status":"no_changes"}`.
- **Contrato antes:** `test/cargo-receiving-schema/cargo-arrival.contract.ts` (no entrypoint
  `cargo-receiving-schema.contract.test.ts`, já listado no `test`) vermelho por
  `Export named 'cargoArrivalEvents' not found` → **18 pass** com o schema.
- **Schema** (`src/database/cargo-arrival.schema.ts`, `cargo-arrival-event.schema.ts`; listas em
  `src/shared/cargo-arrival.constant.ts`):
  - `cargo_arrivals`: FK composta para `contractors` e para o vínculo de quem registrou
    (`user_company_memberships`), janela/prazo copiados com as faixas do perfil, CHECK **exato**
    `extract(epoch from separation_due_at - arrived_at) = separation_window_hours * 3600` (ou os dois
    nulos), `reference` 1..120, `channel in ('backoffice')`, `idempotency_key` 16..256 com unique por
    empresa, `request_fingerprint` sha256, `status in ('open','closed')`; índices por data e por
    contratante + data.
  - `cargo_arrival_documents`: FK composta para a chegada e para `nfe_documents`; `unique (company_id,
nfe_document_id)` (uma nota, uma chegada — ADR-0094 §6) e `unique (company_id, arrival_id, id)` (alvo
    da FK do evento e índice das notas por chegada); CHECK que amarra estado e datas
    (`separated_at >= received_at`); `route_name` 1..40; `city_ibge_code ~ '^[0-9]{7}$'`.
  - `cargo_arrival_events`: append-only por trigger (`reject_cargo_arrival_events_mutation`, 55000);
    FK `(company_id, arrival_id, arrival_document_id)` → nota **desta** chegada; CHECK de escopo (evento
    da chegada ⇔ sem nota) e de forma (`case kind …` repete a tabela de transições: `document_added`
    `null → expected`, `document_received` `expected → received`, `document_separated`
    `received → separated`, demais sem estado).
  - Índice novo `nfe_participants (company_id, role, tax_id)` para achar as notas do emitente, entre
    `SET LOCAL lock_timeout = '3s'` e `DEFAULT` (precedente da spec 196: a importação não fica na fila
    atrás de uma transação longa).
- **Divergências do pedido:** sem `unique (company_id, arrival_id, nfe_document_id)` (redundante com o
  par `(company_id, nfe_document_id)`); sem índice `(rota, cidade)` — o agrupamento é feito em memória
  sobre as ≤ 300 notas de uma chegada, lidas pelo unique `(company_id, arrival_id, id)`; colunas a mais
  `request_fingerprint` (idempotência, revisão do architect) e `from_state`/`to_state` nos eventos; kind
  a mais `arrival_closed`; canal só `backoffice` (ADR-0068 §3: tela que não age em nome de motorista —
  `office` exige `on_behalf_of_driver_id`).
- **`rollback.sql` à mão:** trigger e função, as três tabelas na ordem inversa das FKs, o índice (com
  `lock_timeout`), a entrada do diário; sem `CASCADE`.
- **`make migration-test`:** **121 pass, 0 fail** (8 arquivos; antes 120 — a pasta nova entrou na lista
  fixa de `static-migration.contract.ts`, com teste próprio: só tabelas novas + um índice com espera
  limitada, trigger presente, rollback em ordem e sem `CASCADE`).
- **Mutações** (script, restauração automática):

  | Mutação                                              | Vermelho                  |
  | ---------------------------------------------------- | ------------------------- |
  | sem `unique (company_id, nfe_document_id)`           | contrato do schema 1 fail |
  | prazo solto (`> 0` no lugar da igualdade com janela) | contrato do schema 1 fail |
  | FK do evento sem `arrival_id`                        | contrato do schema 1 fail |
  | `document_received` sem `from_state = 'expected'`    | contrato do schema 1 fail |
  | trilha sem o trigger append-only                     | estático 1 fail           |
  | índice de `nfe_participants` sem `lock_timeout`      | estático 1 fail           |

- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato
  `bun --env-file=../../.env.test test --timeout 120000`: **9243 → 9286 pass**, 24 skip, 0 fail (198
  arquivos; a linha de base desta sessão era 9243, não 9259) · `bun run format:check` na raiz ✓.
- `docs/spec/domain-model.md`: agregados `CargoArrival`, `CargoArrivalDocument`, `CargoArrivalEvent` e as
  constraints únicas.

## T2.3 — casos de uso e rotas da chegada e da primeira separação (2026-10-03)

- **Contrato antes:** `test/cargo-receiving/cargo-arrival-candidate.contract.ts`,
  `cargo-arrival-use-case.contract.ts` e `test/cargo-receiving-http/cargo-arrival-routes.contract.ts`
  (entrypoints já listados no `test`) vermelhos por `Cannot find module …/cargo-arrival-candidate.policy.js`
  e `…/cargo-arrival.routes.js`. Depois: módulo **87 pass** (contrato de domínio/caso de uso), **31 pass**
  (HTTP), **22 pass** (schema + isolamento).
- **Permissões (conferidas em `authorization.policy.ts`):** leitura `fleet.read`, escrita `trip.manage` —
  o papel `separator` tem as duas. `trip.read` foi descartada: é a leitura recortada do motorista, e daria a
  `driver`/`helper`/`aggregate` as chegadas da empresa inteira (BOLA). As 9 rotas entraram na lista
  exaustiva de `test/separator-role.contract.test.ts` (vermelho de 9 linhas antes, verde depois).
- **Rotas:** `GET /cargo-arrivals/available-documents`, `POST /cargo-arrivals`, `GET /cargo-arrivals`,
  `GET /cargo-arrivals/:id`, `POST …/documents/:documentId/receive|separate`, `POST
…/documents/batch-status`, `POST …/route-assignment`, `POST …/close` (caminhos em
  `src/shared/api.constant.ts`, composição em `src/main.ts`, canal `backoffice` decidido na composição).
- **Integração** (`bun --env-file=../../.env.test test --timeout 120000
./test/integration/cargo-arrival.integration.ts`, Postgres do `.env.test` em 65432, banco descartável
  migrado por teste): **6 pass, 0 fail, 0 skip** (49 expects) — chegada completa na mesma transação (1
  chegada, 3 notas, 4 eventos, 1 auditoria) e as candidatas somem; repetição → 200 com a mesma chegada e as
  mesmas contagens; mesma chave com outro pedido → 409; nota de outro emitente, em viagem viva, em outra
  chegada e de outra empresa recusadas **de uma vez** (4 `details`), sem escrita; sem perfil e com perfil
  desligado → 422; contratante de outra empresa → 404; chegada lida/escrita/listada pela outra empresa →
  404/404/vazia, estado intacto; transições e no-op sem evento (contagem exata), `separate` sem `receive`
  → 409, volta → 409; lote com recusa parcial; UPDATE e DELETE na trilha → `55000`; rota repetida sem
  evento, nota fora da chegada → 422; fechar com pendência → 409 com a lista, depois fecha, fechar de novo
  `unchanged`, chegada fechada recusa rota; perfil editado para 48 h depois do registro → a chegada segue
  com 24 h e o mesmo `separation_due_at`; `separation_due_at` fora da janela por fora da API → `23514`;
  "já em viagem" na leitura; quem só tem `fleet.read` → 403 na escrita, sem linha. Registrada em
  `test:integration` (o `package.json` só ganhou essa entrada — conferido por diff dos scripts);
  `integration-shard.contract.test.ts` + integração da Fase 1: 7 pass.
- **Mutações** (script, restauração automática; contrato do módulo + integração da chegada):

  | Mutação                                       | Vermelho                             |
  | --------------------------------------------- | ------------------------------------ |
  | tirar `company_id` do filtro da chegada       | isolamento 1 fail; integração 1 fail |
  | tirar `company_id` do filtro da lista         | isolamento 1 fail; integração 1 fail |
  | tirar o emitente da política de candidatas    | contrato 3 fail; integração 1 fail   |
  | tirar o emitente do filtro das disponíveis    | isolamento 1 fail; integração 1 fail |
  | permitir `separated` sem `received`           | contrato 3 fail; integração 1 fail   |
  | no-op grava (e gera evento)                   | contrato 1 fail; integração 1 fail   |
  | janela lida do perfil atual na leitura        | integração 1 fail                    |
  | uma recusa derruba o lote (lança na primeira) | contrato 2 fail; integração 1 fail   |
  | repetição sem procurar a chave                | integração 1 fail                    |
  | escrita com `fleet.read`                      | HTTP 1 fail; integração 1 fail       |
  | corpo sem `.strict()`                         | HTTP 1 fail                          |
  | perfil desligado registra                     | contrato 1 fail; integração 1 fail   |

  A primeira rodada da "janela lida do perfil atual" quebrou por import ausente (erro, não comportamento);
  refeita com o import: integração 5 pass / 1 fail. "Uma recusa derruba o lote" é a prova do `Promise.all`
  pedido: não há `Promise.all` na escrita — o lote é decidido em memória e gravado com um UPDATE e um
  INSERT, e a mutação simula o efeito (lançar na primeira recusa).

- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato
  `bun --env-file=../../.env.test test --timeout 120000`: **9286 → 9330 pass**, 24 skip, 0 fail (198
  arquivos; o script `test` dá os mesmos 9354 testes) · `bun run db:generate` → `no_changes` · `bun run
format:check` na raiz ✓.
- **Divergências do pedido:**
  1. `perPage` virou `limit` (≤ 100): é o parâmetro de `readPaging`, que toda listagem desta API usa.
  2. Erros: `CARGO_ARRIVAL_KEY_REUSED` (precedente `TRIP_FIELD_REPORT_KEY_REUSED`),
     `CARGO_ARRIVAL_ARRIVED_AT_IN_FUTURE` (422, campo `arrivedAt`), `CARGO_ARRIVAL_DOCUMENTS_REFUSED` (422),
     `CARGO_ARRIVAL_DOCUMENTS_NOT_IN_ARRIVAL` (422, rota), `CARGO_ARRIVAL_DOCUMENT_NOT_FOUND` (404),
     `CARGO_ARRIVAL_NOT_FOUND` (404), e o 409 da nota avulsa leva o motivo da política como código
     (`CARGO_ARRIVAL_CLOSED`, `…_DOCUMENT_NOT_RECEIVED`, `…_TRANSITION_NOT_ALLOWED`). Esta API não tem
     `codes.ts`: o padrão é `ApiError` por domínio em `domain/*.error.ts`.
  3. `:documentId` nas rotas é o id da NF-e (chave natural: a nota está numa chegada só).
  4. Lote: nota repetida no pedido é 400 (Zod), não "unchanged".
  5. `route-assignment` é tudo ou nada (nota fora da chegada → 422 com todas), ao contrário do lote de
     estado; chegada fechada recusa rota (409 `CARGO_ARRIVAL_CLOSED`).
  6. Na T2.3 o schema da nota foi para `src/database/cargo-arrival-document.schema.ts` (o arquivo passava
     de 200 linhas); DDL igual, `db:generate` = `no_changes`.
  7. `isSeparationOverdue`: prazo passado **e** nota ainda não separada (tudo separado nunca vence).
- **Não rodou:** a suíte de integração inteira (`bun run test:integration`, ~17 min) — só os arquivos
  tocados; corrida real entre duas requisições concorrentes (a serialização por trava foi desenhada e
  revisada, não exercitada por teste de concorrência).

## T2.4 — recebimento no painel e a primeira separação pelo celular (2026-10-03)

- **Contrato antes** (`25e51e927`): 10 arquivos de contrato puro + 4 de DOM + fixture e servidor dublado, todos
  vermelhos por `Cannot find module …/cargo-receiving/…` (o módulo não existia). Implementação em `c92e4adf0`
  e refinamento em `7922063ab` + o commit dos prints. Os entrypoints novos entram na lista explícita:
  `test/cargo-receiving.contract.test.ts` (no script `test` do `package.json`, única edição de lista) e os quatro
  `test/trip-hooks/cargo-*.contract.ts` em `trip-hooks.contract.test.ts`.
- **Contagem:** `bun run test` **6624 → 6759 pass / 0 fail** (+134 do módulo e +1 do mapa de acesso) e `test:hooks`
  **385 → 454 pass / 0 fail** (+69). `tsc --noEmit` limpo; `eslint` 0 erros (16 avisos preexistentes, nenhum nos
  arquivos novos); `format:check` na raiz ✓.
- **O que existe** (`apps/frontend-transportada/src/modules/cargo-receiving/`, namespace `cargoReceiving`, pt-BR e
  en): rota **`/recebimento`** no grupo Operações, visível só com `fleet.read` (mapa de permissão da spec 221,
  contrato de menu/acesso/parede atualizado); **lista** de chegadas (ordenação por cabeçalho, contratante e situação
  com seleção múltipla, "limpar filtros" só com critério, estado na URL, "carregar mais" por cursor); **registro**
  (`/recebimento/nova`: só contratante com perfil ligado, data/hora no fuso do navegador, paletes e referência
  opcionais, notas por checkbox com contador e limite 300, `Idempotency-Key` por tentativa); **detalhe do escritório**
  (`/recebimento/:id/detalhe`: grupos rota × cidade com contagem por estado, selo "já em viagem", atribuir rota,
  receber/separar em lote com o resultado de CADA nota, fechar com a lista das pendentes); e a **tela do celular**
  (`/recebimento/:id`: grupos recolhíveis, o primeiro com pendência aberto, botão grande por nota com o próximo
  passo em texto, "separar tudo deste grupo", busca por número e leitura da chave pela câmera, "sem conexão",
  "tentar de novo").
- **Nenhuma mudança de API foi necessária:** a API devolve nome da cidade (`cityName`), os três estados, as
  contagens, `isSeparationOverdue`, `isInLiveTrip` e os `details` por nota/campo. Único dado que falta é o **peso**
  da nota nas disponíveis (ver divergências).
- **Mutações** (script, restauração automática, `git diff` limpo depois; "puro" = `bun test` dos contratos puros +
  `shared`; "DOM" = a suíte completa de `test:hooks`):

  | Mutação                                                        | Puro | DOM |
  | -------------------------------------------------------------- | ---- | --- |
  | próximo estado errado (esperada → separada, pula etapa)        | 2    | 4   |
  | lote do grupo pula `received`                                  | 4    | 3   |
  | recusa no recebimento não tira a nota do passo de separar      | 1    | 1   |
  | recusa derruba o lote (nada é aplicado)                        | 1    | 1   |
  | chave de idempotência nova a cada envio (serviço)              | 1    | 2   |
  | idem, no hook (`previous: undefined`)                          | 0    | 2   |
  | a ordem das notas entra na impressão do pedido                 | 1    | 0   |
  | limite 300 → 301                                               | 3    | 2   |
  | atualização otimista sem reversão em queda de rede (`onError`) | 0    | 1   |
  | atualização otimista sem reversão em recusa                    | 0    | 1   |
  | sem atualização otimista (`onMutate` não grava)                | 0    | 2   |
  | menu e parede abrem também com `trip.report`                   | 5    | 0   |
  | erros sem dedup (nota recusada repetida)                       | 1    | 0   |
  | campo desconhecido some do aviso                               | 2    | 1   |
  | "limpar filtros" sempre visível                                | 1    | 2   |
  | ordenação sem neutro (asc → desc → asc)                        | 1    | 1   |
  | URL não leva o estado da lista                                 | 0    | 3   |
  | quem só lê ganha "Separar"                                     | 0    | 1   |
  | guarda aceita chave a mais na chegada                          | 1    | 0   |
  | rota de 400 caracteres passa                                   | 0    | 2   |
  | chegada no futuro aceita                                       | 1    | 0   |
  | motivo da recusa some da linha                                 | 0    | 1   |
  | "tentar de novo" não refaz o toque                             | 0    | 1   |
  | nota com toque em voo não trava o botão                        | 0    | 1   |
  | grupo abre sempre o primeiro, mesmo concluído                  | 2    | 1   |
  | atalho da nota não leva o foco                                 | 0    | 4   |
  | `Idempotency-Key` some do cabeçalho                            | 1    | 0   |
  | `companyId` vai no corpo do registro                           | 1    | 0   |
  | resultado por nota só das recusadas                            | 0    | 1   |
  | contagem por estado do grupo zerada                            | 0    | 1   |

  A primeira rodada achou **quatro mutações que sobreviveram**: as duas "sem reversão" (a releitura que o
  `onSettled` dispara devolvia o estado certo e escondia a falta da volta), "toque em voo não trava o botão" (sem
  contrato) e "erros sem dedup" (mutação mal escrita, que só declarava uma variável). Corrigido com três
  contratos novos — a releitura da chegada fica **pendurada** no dublê (`holdReads`), então a volta tem de
  vir do cache, e o botão da nota em voo tem de estar travado — e a mutação do dedup foi refeita. Todas
  derrubam teste agora.

- **Defeitos que o próprio trabalho achou e consertou:** (1) o contrato do `MultiSelect`/`SearchableSelect` só
  passa dentro da suíte completa do `test:hooks` — isolado, a lista de opções vem vazia (já era assim na T1.4;
  anotado no CLAUDE.md da app); (2) o dublê do servidor reaproveitava `counts` antigo ao reconstruir a chegada
  (bug do fixture, não do código); (3) `Separar` aparecia em chegada **fechada** — contrato novo e botão some.
- **Divergências do pedido:**
  1. **Peso da nota não aparece** na lista de notas disponíveis: `GET /cargo-arrivals/available-documents` devolve
     valor, não peso. Não exigiu mudar a API para a tela funcionar; fica como follow-up de API.
  2. **"Selecionar todos da página" é "selecionar todas as listadas"** (as que a busca deixou): a API pagina por
     cursor de 100 e "página" não é um conceito estável na tela; a seleção acumula entre buscas e é cortada em 300.
  3. **A paginação por cursor não vai na URL** (o cursor é opaco e acumula): na URL vão contratante, situação e
     ordenação; "carregar mais" soma à lista. A ordenação é sobre o que já foi carregado (a API não ordena).
  4. **Filtro múltiplo:** a API filtra por UM contratante e UMA situação; com um valor o filtro vai ao servidor, com
     vários o cliente filtra o que veio.
  5. **Rotas:** o pedido deu `/recebimento/:id` ao celular; o detalhe do escritório ficou em
     `/recebimento/:id/detalhe`, e "Abrir a separação no celular"/"Abrir a visão do escritório" ligam os dois.
  6. **"Toast de erro com o motivo"** virou aviso na linha da nota (`role="alert"`) e no painel do lote: o painel
     não tem componente de toast, e a mensagem fica junto do que falhou, onde "tentar de novo" também mora.
  7. **Contratante com perfil ligado** custa uma leitura de perfil por contratante (não há rota em lote — mesma
     limitação da T1.4). Guardas de resposta e erro são **próprios** do módulo (nada importado de `delivery-clients`);
     contratante e perfil são lidos por projeção mínima.
  8. **Câmera reaproveitada:** o primitivo `@/components/ui/barcode-scanner` + `extractNfeAccessKey` (o mesmo da
     viagem) — não acopla módulos. A nota achada vira a busca e abre o grupo dela.
- **Revisão de design (web.md §15)** — `spec-237-recebimento-prints.smoke.spec.ts`, 1280 px escuro, estilo
  calculado, contra a aba Contratantes (a mesma sessão, a mesma API dublada):

  | Medida                    | Vizinho (Contratantes)                    | Novo                                      |
  | ------------------------- | ----------------------------------------- | ----------------------------------------- |
  | campo: altura/fonte/borda | 48px · Avenir 14,4px · 1px lousa · raio 0 | hora e referência: idêntico               |
  | campo: padding            | 12px                                      | 12px                                      |
  | botão: altura/padding     | 48px · 12×20px · raio 0                   | "Abrir" e "Registrar chegada": idêntico   |
  | selo: mono/altura         | 11,52px · 24px · 1px                      | idêntico (cor própria: vencida em alerta) |
  | cabeçalho de tabela       | 61px                                      | 61px                                      |
  | célula de tabela          | 65px                                      | 67px (a barra de progresso é mais alta)   |

  Contraste (WCAG, texto sobre o fundo opaco efetivo), escuro / claro: rótulo 14,48 / 12,66 · ajuda 6,22 / 4,83 ·
  selo aberta 6,59 / 5,50 · selo vencida 5,46 / 4,69 · selo já em viagem 6,16 / 5,37 · aviso e erro de recusa 5,46 /
  4,69 · indicador de ordenação 5,87 / 4,57 · contagem do grupo (celular) 6,35 / 5,65 · destinatário (celular) 6,95 /
  5,27 · botão do passo 5,87 / 4,94 · nota separada 6,75–7,22 / 5,49–5,84. Nenhum abaixo de 4,5:1.
  **Alvo de toque a 375 px, TODOS os 19 controles do celular** (botões, campo de busca, atalhos do resultado do lote,
  "dispensar"): o menor tem **44 px** de altura e 59,6 px de largura. Nenhuma das 36 telas tem rolagem horizontal
  (afirmado pelo próprio teste de print).

  Defeitos achados nos prints e consertados: (a) o `h1` global limita a 12ch e quebrava "Chegada de Alfa Indústria
  Fictícia" em três linhas — `max-width: none` no cabeçalho do módulo; (b) a barra de seleção do escritório
  espalhava contador, rota e botões em três colunas — virou coluna, com a linha "rota + aplicar"; (c) as tabelas
  dos grupos desalinhavam as colunas entre si — colunas fixas; (d) a lista a 375 px rolava de lado porque o texto
  só-leitor da ordenação (`position: absolute`) escapava do quadro da tabela — o quadro passou a ser `position:
relative`; (e) o atalho da nota recusada tinha 22 px no celular — virou alvo de toque (mobile-first, o desktop o
  aperta); (f) "separar tudo deste grupo" competia com o botão da nota — virou secundário.

- **Prints** (60 PNG no total, 36 novos, `specs/237-a-carga-chega-e-se-separa-antes-da-viagem/prints/`,
  375/768/1280 × escuro/claro): `recebimento-lista-*`, `recebimento-registrar-chegada-*` (5 notas marcadas e o
  contador), `recebimento-registrar-recusa-*` (3 notas e 1 campo recusados, com atalhos), `recebimento-detalhe-*`,
  `recebimento-celular-separacao-*` (um grupo aberto, notas nos três estados, "separar tudo" e progresso) e
  `recebimento-celular-lote-*` (resultado de um lote com uma nota recusada). Gerados por
  `test/spec-237-recebimento-prints.smoke.spec.ts` (fora do smoke da CI; build com `VITE_SMOKE_AUTH_BYPASS=true`
  em pasta temporária e preview na porta 53277; config do Playwright descartável, apagada no fim — a config da CI e
  a porta reservada dela não foram tocadas). API 100% dublada, dados inventados. A recusa do lote é **simulada** no
  dublê: a API real não recusa `expected → received`.
- **Não rodou:** `make smoke`/smoke da CI, `make check` completo (o build de produção só foi feito para os prints,
  sem os `assets:*` do `prebuild`), integração da API (nada da API mudou), teste em aparelho/câmera reais, teste de
  concorrência de dois separadores na mesma chegada.
- **Follow-ups:** fila offline do toque (hoje o toque que falha fica na tela com "tentar de novo", mas não
  sobrevive a fechar o app); rota em lote de perfis para o selo; peso da nota em `available-documents`; o
  `pointer: coarse`/desktop do atalho do resultado do lote; avaria na entrada (Fase 3, D4).

### Estabilidade dos contratos de DOM (T2.4)

O `test:hooks` reprovava de forma intermitente (CI: `a URL reabre a lista filtrada e ordenada`, 10518 ms; local:
1 em 3 execuções). O "484 pass" reportado antes vinha de **uma** rodada — insuficiente.

- **Reprodução.** Sem carga: 10/10 verdes (15–17 s). Com carga (12 processos `yes` ocupando os núcleos): **8/8
  execuções reprovaram** (9 a 13 falhas, todas em `cargo-arrival-list.contract.ts`; os arquivos de registro,
  detalhe, separação e Contratantes não reprovaram nenhuma vez). Cada teste da lista caía em ~10–15 s com
  `expect(received).toBeNull()` em `mountList` (`cargo-arrival-list.contract.ts:61`), e o log chegava a 650 MB.
- **Causa raiz — dois defeitos do arnês, nenhum do produto.**
  1. `waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull())`: logo após o `render` a lista
     ainda mostra o esqueleto (a busca resolve no macrotask seguinte) — a primeira tentativa **reprova por
     desenho**, é para isso que `waitFor` existe. Mas `expect(nó).toBeNull()` reprovado **formata o nó inteiro do
     happy-dom** na mensagem. Sonda temporária no `waitFor`: 13 vezes por suíte, a primeira tentativa reprovava e
     custava **~550 ms sem carga e 830–1080 ms com carga**.
  2. O prazo do `waitFor` era de relógio (1000 ms desde o início): com a reprovação custando >1 s, a primeira
     tentativa era também a **última** (`attempt=1` seguido do `throw`, sem nenhum `settle`). O teste falhava sem
     nunca ter esperado; o `bun` ainda gastava ~10 s imprimindo o DOM. As reprovações em cascata vinham da raiz
     React que ficava montada (o `unmount()` do fim do teste não roda quando a asserção cai antes), e os avisos de
     `act` das execuções ruins eram dela.
     As hipóteses (a) `QueryClient` global, (c) `window.location`, (d) retry do TanStack e (e) vazamento do fetch do
     dublê foram descartadas por evidência: `QUERY_CLIENT_DEFAULT_OPTIONS` já tem `retry: false`, o cliente é novo por
     montagem, e o `attempt` nunca passou de 1 antes do estouro.
- **Correção** (só `test/`): `renderHook.helper.ts` — (i) `waitFor` conta o tempo **esperado** (soma dos `settle`),
  não o que uma asserção reprovada custou; (ii) toda raiz montada é registrada e um `afterEach` do próprio arnês a
  desmonta (`unmount` idempotente), mesmo quando a asserção falhou antes do `unmount()` do teste;
  `cargo-arrival-list.contract.ts:61` e `location-retention-panel.contract.ts:194` passaram a afirmar a **contagem**
  (`querySelectorAll(...).length`), que não formata nó. Contrato do arnês: `test/trip-hooks/wait-for-budget.contract.ts`
  (+4 testes: 488 no total).
- **Mutação.** Voltar o prazo para o relógio reprova `a primeira reprovação cara não esgota o prazo`; tirar o
  `afterEach` reprova `…o afterEach do arnês a desmonta antes do teste seguinte`. (O `beforeEach` de outros
  arquivos já esvazia o `body`, por isso a prova da desmontagem é o efeito de limpeza do React, não o nó solto.)
- **Prova de estabilidade.** Antes: com carga 8/8 reprovadas; sem carga, 1 reprovação em 3 (relato da sessão) e 10/10
  verdes nesta. Depois: **20/20 verdes sem carga** (488 pass, 0 fail; 9–11 s, antes 15–17 s) e **12/12 verdes com
  carga** (12 processos `yes` + duas suítes concorrentes). `bun run test` 6817 pass; `bun run typecheck`, `bun run
lint` (0 erros, 16 avisos antigos) e `format:check` na raiz limpos.
