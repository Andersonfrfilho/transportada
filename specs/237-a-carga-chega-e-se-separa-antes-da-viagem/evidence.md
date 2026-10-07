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
| desvio do peso (`PESO TOTAL` × `pesoB`)                | até **5 g** (arredondamento; ver T4.3)      |
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

## T4.1 — a biblioteca e os limites da leitura da planilha (2026-10-04)

- **Decisão (ADR-0094 §7):** leitor mínimo próprio sobre `fflate` 0.8.3 e `fast-xml-parser` 5.10.1,
  as duas **já dependências diretas da API** (`apps/api-transportada/package.json`). Nenhuma dependência
  nova; `bun install --frozen-lockfile` sem mudança no `bun.lock`.
- **Pacotes conferidos no registro** (`npm view <pacote> name version time.modified repository.url
maintainers dependencies`): `fflate` 0.8.3 (101arrowz, github.com/101arrowz/fflate, sem dependências);
  `fast-xml-parser` 5.11.2 no registro, 5.10.1 instalada (NaturalIntelligence); `exceljs` 4.4.0 (último
  publish 2024-12-20, depende de `jszip`, `unzipper`, `archiver`, `saxes`, `tmp`); `read-excel-file`
  9.3.10 (2026-08-10, `fflate`, `saxen`, `unzipper-esm`, `worker-f`); `xlsx` 0.18.5 (a do npm; os avisos
  GHSA-4r6h-8v6p-xvw6 `< 0.19.3` e GHSA-5pgg-2g8v-p4x9 `< 0.20.2` só têm correção fora do npm).
- **Avisos das escolhidas** (`gh api /advisories?ecosystem=npm&affects=…`): `fflate` GHSA-px8p-9vwx-vf98
  corrigido **em 0.8.3**; `fast-xml-parser` GHSA-8r6m-32jq-jx6q corrigido **em 5.10.1**. `bun audit` não
  aponta nenhuma das duas na versão direta da API (o aviso `< 5.7.0` é de cópia transitiva do pacote
  fiscal e do `mailauth`, e é do `XMLBuilder`, que o leitor não usa).
- **Medido nas quatro planilhas FR** (zip lido por Python, sem macro nem fórmula): arquivo 0,80–0,82 MB;
  25 entradas; `xl/worksheets/sheet1.xml` **3 359 396–3 387 795 bytes** descomprimidos (a maior);
  `sharedStrings.xml` 16–27 KB, 492–802 strings, a maior com 49 caracteres; `workbook.xml` 1,2 KB;
  13 792 linhas na aba, a última com dado entre 127 e 220; `vbaProject.bin` 19 968 bytes; nenhuma célula
  com `<f>` ou `t="e"` na `IMPORTAÇÃO`; 378 `#NAME?` na `RESULTADO`.
- **Por que varrer a aba por linha:** `fast-xml-parser` na aba inteira (`FR-05-10`) mediu **237 ms e
  80 MB de heap**; com 30 MiB seriam ~9×. Inflar 200 MiB de zeros em fatias de 4 KiB parou em 33,5 MB
  em 195 ms (o teto funciona sem decodificar o resto).
- Tetos finais e erros tipados: tabela do ADR-0094 §7.

## T4.3 (parte A, núcleo puro) — leitor da planilha e política de vínculo (2026-10-04)

Só domínio puro em `apps/api-transportada/src/cargo-receiving/domain/` (sem I/O; relógio e tetos por
parâmetro). **Não fecha a T4.3**: faltam a migration, a rota de upload, a reavaliação dos `awaiting_xml`
a cada XML importado e o vínculo manual (parte B).

- **Contrato antes, vermelho pelo motivo certo:** leitor — `Cannot find module
'../../src/cargo-receiving/domain/cargo-preview-workbook.error.js'` (0 pass, 2 fail); política —
  `Cannot find module '…/cargo-preview-matching.policy.js'` e `…/cargo-preview-matching.constant.js` (0 pass,
  3 fail). Suítes no entrypoint `test/cargo-receiving.contract.test.ts`, que o `test` do `package.json` já
  lista (o `package.json` não mudou).
- **Leitor contra as quatro planilhas reais** (fora do repositório): FR-24-09 **187** linhas, FR-28-09
  **107**, FR-01-10 **191**, FR-05-10 **194**, **0** `rowErrors`, 10/8/12/11 roteiros, datas
  2026-09-23/25/30 e 2026-10-02; **45–70 ms** por planilha (5 rodadas). Valor, peso, volume, cidade, UF,
  rota e data **iguais linha a linha** (294/294) ao leitor independente em Python com `Decimal`.
- **Corpus anonimizado** (`test/fixtures/cargo-preview-corpus/`, gerado fora do repositório): razão social
  → `Destinatário NNN`, CEP → `00NNNNNN` (faixa sem uso), CNPJ/CPF → `990000NNNNNNNN`, `Company` → `10NNN`,
  `Text001` → `50NNNN`, `nNF` → `1NNNNN`; endereço e bairro fora; igualdade preservada. Ficam roteiro,
  valor, peso, volume, cidade, `NroCarga` e datas.
- **Taxas no corpus** (notas do mesmo dia do roteiro; tolerância de peso 0,05% — a mesma tabela vale
  com a tolerância **0** depois do piso de 0,01 kg, salvo "roteiros cujos totais fecham", ver abaixo):

  | Medida                                                             | FR-24-09 (187)         | FR-28-09 (107)         |
  | ------------------------------------------------------------------ | ---------------------- | ---------------------- |
  | por linha isolada: valor + peso → 1 nota                           | 146 (78%)              | 91 (85%)               |
  | por linha isolada: valor + CEP → 1 nota                            | 139 (74%)              | 96 (90%)               |
  | **política: `matched`**                                            | **180 (96%)**          | **97 (91%)**           |
  | `suggested` / `ambiguous` / `awaiting_xml`                         | 5 / 0 / 2              | 6 / 2 / 2              |
  | clientes (rota × código) com todas as linhas fechadas              | 158/165 (96%)          | 94/104 (90%)           |
  | idem, nos roteiros cujos totais fecham                             | **60/60** (5 roteiros) | **57/58** (5 roteiros) |
  | clientes com 2–3 linhas numa nota                                  | 19/19                  | 3/3                    |
  | pares roteiro ↔ carga                                             | 10 (5 totais, 5 votos) | 8 (5 totais, 3 votos)  |
  | aliases aprendidos (0 conflito; 21 códigos voltam no dia seguinte) | 158                    | 94                     |
  | tempo da política                                                  | 2–9 ms                 | 1–3 ms                 |

  FR.BARRI: **20 linhas → 16 notas**, mesmo valor total, todas vinculadas. Os `suggested` são peso
  realmente diferente (ex.: 47,610 × 27,212 kg) com valor, CEP e razão social iguais; os 2 `ambiguous` são
  dois clientes com 2.948,40 / 238,000 e duas notas idênticas na mesma carga (sem alias, empate de
  verdade); os `awaiting_xml` não têm nota com o mesmo valor.

- ⚠️ **O peso não é exato ao grama**: diferença de até **5 g** por arredondamento da planilha (pior caso
  0,0321%). Antes do piso, com a tolerância **0** (padrão do perfil): FR-24-09 **89** `matched` e 96
  `suggested`; clientes 78/165. Decisão do coordenador: piso absoluto (ver a seção do piso abaixo).
- **Escala:** 300 linhas × 300 notas em **17 ms** com carga e **15 ms** sem (teto do contrato: 1 s).
- **Prova de ausência de PII:** a forma anonimizada é conferida sempre (CI). Contra os arquivos reais
  (`CARGO_PREVIEW_PII_WORKBOOK_DIR=~/Downloads CARGO_PREVIEW_PII_NFE_DIR=~/Downloads/ID1026570_procNFe_parte1`):
  **0** razão social/endereço, **0** CNPJ/CEP, **0** código/pedido/número reais nos arquivos novos (2 pass).
  Sem as variáveis: 1 pass, 1 skip. Injetar um CNPJ, uma razão social ou um CEP real no corpus derruba o
  teste (1 fail cada; restaurado).
- **Mutações** (script fora do repositório, restauração automática; `src` limpo depois):

  | Leitor                                    | Vermelho | Política                                   | Vermelho  |
  | ----------------------------------------- | -------- | ------------------------------------------ | --------- |
  | ignorar o teto contado da descompressão   | 1 fail   | tirar o 1:1 (nota disputada)               | 3 fail    |
  | ignorar o teto declarado por entrada      | 3 fail   | nota em dois grupos (passada reusa a nota) | 3 fail    |
  | ignorar o teto total                      | 1 fail   | soma aproximada (±1 centavo)               | 2 fail    |
  | ler a macro (`vbaProject.bin`)            | 2 fail   | pular o alias                              | 1 fail    |
  | sem conferir bytes mágicos (poliglota)    | 1 fail   | ordem instável dos ids candidatos          | 1 fail    |
  | sem teto de entradas                      | 1 fail   | empate de roteiro pareia mesmo assim       | 1 fail    |
  | aceitar caminho com `..` (zip-slip)       | 5 fail   | ignorar os pares já conhecidos             | 1 fail    |
  | aceitar `DOCTYPE`                         | 1 fail   | peso não exigido para `matched`            | 6 fail    |
  | sem teto de linhas                        | 1 fail   | só valor vira `matched`                    | 6 fail    |
  | sem orçamento de tempo                    | 1 fail   | aprender alias de sugestão                 | 1 fail    |
  | sem teto de strings compartilhadas        | 1 fail   | repetir alias já conhecido                 | 1 fail    |
  | aceitar valor negativo                    | 4 fail   | sem teto da partição (> 6 linhas)          | 1 fail    |
  | `#NAME?` como valor                       | 1 fail   | sem teto de nós da busca                   | 1 fail    |
  | avaliar a fórmula (`<f>` em vez de `<v>`) | 1 fail   | padrão de `NroCarga` sem o filtro          | 4 fail    |
  | coluna por posição                        | 48 fail  | `infCpl` sem o corte de 2 000              | 1 fail    |
  | cabeçalho de rota vira item               | 1 fail   | PII: CNPJ / razão social / CEP real        | 1 / 1 / 1 |
  | sem o 29/02/1900 do Excel                 | 2 fail   |                                            |           |

  Dois mutantes sobreviveram na primeira rodada e mudaram o teste ou o código: `aceitar DOCTYPE` (o teste
  trocava o `sharedStrings` inteiro e caía por índice fora da faixa — passou a inserir só o `DOCTYPE`) e
  `sem teto de strings` (havia uma segunda conferência depois do parse; ficou uma só, antes, que também
  conta `<x:si>`). `sem ordenar as notas de entrada` sobreviveu por ser equivalente (toda saída já é
  ordenada) — a ordenação foi removida. O teto de nós ganhou parâmetro (`maxNodes`) para ser provado.

- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ (0 erro, 0 aviso) · contrato
  `bun --env-file=../../.env.test test --timeout 120000`: antes **9447 pass / 24 skip / 0 fail**, depois
  **9567 pass / 25 skip / 0 fail** (198 arquivos; o skip novo é a checagem de PII real) · `bun run
format:check` na raiz ✓ · `bun install --frozen-lockfile` sem mudança. Integração não foi rodada:
  nada aqui toca banco.

### T4.3 — o piso de arredondamento do peso (2026-10-04, decisão do coordenador)

- **Regra:** o peso concorda quando `|Δ| ≤ max(0,01 kg, weight_tolerance_percent × peso da nota)`
  (`PREVIEW_WEIGHT_ROUNDING_FLOOR_KG = 0.01` em `cargo-preview-matching.constant.ts`, aplicado em
  `createWeightCloses`). A diferença de até 5 g é arredondamento da planilha (2 casas × 3 do `pesoB`), não
  regra do contratante; o padrão do perfil fica `0`, sem migration.
- **Contrato antes:** `Export named 'PREVIEW_WEIGHT_ROUNDING_FLOOR_KG' not found` e o corpus com tolerância 0
  vermelho (6 fail). Casos: Δ 0,005 kg e 0,010 kg com tolerância 0 → `matched`; Δ 0,011 kg → `suggested`; Δ
  0,05 kg em 100 kg com 0,05% → `matched`; Δ 0,005 kg em 2 kg com 0,05% → `matched` (piso também com
  percentual); Δ 0,06 kg em 100 kg com 0,05% → `suggested`.
- **Corpus com tolerância 0, depois do piso:** FR-24-09 **180** `matched` / 5 `suggested` / 2
  `awaiting_xml`; FR-28-09 **97** / 6 / 2 `ambiguous` / 2 — iguais aos de 0,05%. Clientes 158/165 e 94/104.
  Muda só a origem de um par por planilha (FR.ORLAN, FR.IGARA): a soma do roteiro inteiro acumula mais de
  10 g, então o par sai por **votos** em vez de totais; nos roteiros cujos totais fecham, 47/47 e 40/40.
- **Mutações:** tirar o piso **8 fail** · `max` → `min` (exigir piso e percentual) **10 fail** · piso só com
  tolerância 0 **1 fail** (o primeiro rodou com 0 fail; o caso de 2 kg com 0,05% foi acrescentado).

## T4.2 + T4.3 (parte B) — envio, leitura, vínculo e reavaliação (2026-10-04)

Commits `ca809b880` (migration), `c7a042556` (rotas da API), `50228c83e` (worker: leitura e vínculo),
`5e2cab03e` (worker: reavaliação pela importação). Desenho e decisões: ADR-0094 §8.

- **Migration aditiva** `20261004140624_cargo_previews` (7 tabelas novas, nenhuma existente alterada;
  `cargo_preview_events` append-only por trigger; `rollback.sql` na ordem inversa das FKs, sem CASCADE).
  O snapshot encadeia no de `20261003204733_cargo_arrivals` (conferido em `origin/staging` depois de
  `git fetch`: nenhuma migration nova lá). `make migration-test`: **124 pass / 0 fail**. `bun run
db:generate`: **`no_changes`**. O CHECK do alias foi ajustado para CNPJ alfanumérico (o contrato
  `tax-id-pattern` reprovou o `[0-9]{14}` da primeira versão) antes de qualquer publicação.
- **1:1 da nota no banco:** `cargo_preview_document_links unique (company_id, document_id)`; o item
  vinculado aponta para o vínculo da prévia dele por FK composta `(company_id, preview_id,
matched_document_id)`. Provado por inserção direta (unique violada) e por dois operadores
  concorrentes ligando a mesma nota a prévias diferentes (um 200, um 422, um vínculo só).
- **Contrato antes, vermelho pelo motivo certo:** schema — `Export named 'cargoPreviewRouteLoads' not
found` (0 pass, 1 fail); rotas e políticas — `Cannot find module …/cargo-preview-action.routes.js` e
  `…/cargo-preview-item-action.policy.js` (0 pass, 2 fail). No worker o contrato de runtime reprovou
  pelo motivo certo ao entrar o trilho novo (`Runtime contract should inject consumers directly`, 2
  fail) e foi atualizado com o consumidor e o fechamento do publisher novo; os contratos do domínio do
  worker foram escritos junto com o código, e o vermelho deles foi provado por mutação (tabela abaixo).
- **Gates — API:** `bun run typecheck` ✓ · `bun run lint` (eslint `src test`) ✓ · contrato
  `bun --env-file=../../.env.test test --timeout 120000`: antes **9574 pass / 25 skip / 0 fail**, depois
  **9633 pass / 25 skip / 0 fail** (198 arquivos) · integração tocada (`cargo-preview`, `cargo-arrival`,
  `contractor-receiving-profile`, Postgres do `.env.test`): antes 9, depois **15 pass / 0 fail**.
- **Gates — worker:** `bun run typecheck` ✓ · `bun run lint` ✓ · `bun run test`: antes **1569** (1611 −
  os 42 novos), depois **1611 pass / 0 fail**. Integração: `make worker-integration` **não rodou** — o
  alvo reusa `transportada_worker_integration`, e o banco local estava com o diário divergente
  (`column "latitude" of relation "trip_status_events" already exists` no `db:migrate`, de outra
  branch). Os mesmos passos (banco novo `transportada_worker_integration_spec237`, `db:migrate` da API,
  `bun run test:integration` com `RABBITMQ_TEST_URL`) deram **181 pass / 1 fail**; o que reprova é
  `osrm-routing-matrix` (o OSRM local tem outro mapa: `Expected 4511.2, Received 1143650`), que não toca
  nada desta mudança. Os 11 novos (`cargo-preview`, `cargo-preview-corpus`, `cargo-preview-reevaluation`)
  passam.
- **Corpus de ponta a ponta (FR-28-09, anonimizado):** planilha montada das 107 linhas, as notas de
  25/09 gravadas com `NroCarga` no `infCpl`, leitura e vínculo pelo banco = política pura: **97 matched
  / 6 suggested / 2 ambiguous / 2 awaiting_xml** (os números da parte A com tolerância 0), 8 pares
  roteiro ↔ carga (4 por totais, 4 por votos), 94 aliases.
- **Lote:** 300 XMLs importados em 300 transações (uma por nota, como a importação) → **1** pedido de
  reavaliação pendente; o lote inteiro em ~1,6 s.
- `bun run format:check` (raiz) ✓ · `bun install --frozen-lockfile` sem mudança depois de acrescentar
  `fast-xml-parser` ao worker (o `bun.lock` ganhou a linha da dependência do workspace, mesma versão).

**Mutações** (script fora do repositório, arquivo restaurado e conferido por sha256 a cada uma):

| Regra (API)                                    | Vermelho | Regra (worker)                                       | Vermelho |
| ---------------------------------------------- | -------- | ---------------------------------------------------- | -------- |
| tirar o filtro de empresa da prévia            | 1 fail   | tirar o filtro de emitente das candidatas            | 1 fail   |
| aceitar tipo pela extensão (sem bytes mágicos) | 1 fail   | tirar o filtro de empresa das candidatas             | 3 fail   |
| sem teto de tamanho na rota                    | 1 fail   | tirar a janela do perfil                             | 1 fail   |
| formulário aceita `companyId`                  | 2 fail   | sobrescrever alias em conflito                       | 1 fail   |
| perfil sem prévia ligada aceita envio          | 1 fail¹  | reavaliar item decidido pelo operador                | 1 fail   |
| nota de outra prévia vira vínculo (sem 1:1)    | 2 fail   | sem a trava do contratante (nota em dois grupos)     | 1 fail   |
| vínculo manual sem conferir o emitente         | 1 fail   | sem conferir o sha256 do objeto                      | 1 fail   |
| desvincular só a linha (sem o grupo)           | 1 fail   | ler de novo prévia já lida                           | 1 fail   |
| objeto fica no bucket quando a transação falha | 1 fail   | falha do leitor vira item parcial                    | 1 fail   |
| propor a chegada sem a política de candidatas  | 1 fail   | vincular a prévia mais nova primeiro                 | 1 fail   |
| —                                              | —        | reavaliação que derruba a importação (sem savepoint) | 1 fail   |
| —                                              | —        | sem coalescência (um pedido por XML)                 | 1 fail   |
| —                                              | —        | pedido sem o filtro do emitente                      | 2 fail   |
| —                                              | —        | pedido sem adiamento                                 | 1 fail   |

¹ Sobreviveu na primeira rodada (o perfil de teste não tinha mapa, e o filtro do mapa recusava
sozinho); o teste passou a gravar o mapa com a prévia desligada. `sobrescrever alias em conflito`
também sobreviveu na primeira rodada (a política nunca propõe código já conhecido, então o
`onConflictDoNothing` não era exercitado): entrou o teste que chama o escritor de alias direto.

- **Não rodou:** `make worker-integration` como está (banco compartilhado divergente — ver acima); a
  integração completa da API (só as tocadas); smoke e `make check`; leitura em `worker_thread`; teste
  em produção ou staging (nada foi publicado).
- **Follow-ups:** `previewId` opcional no `POST /cargo-arrivals` para preencher `cargo_previews.arrival_id`
  (fica com a T4.4, que é quem cria a chegada a partir da prévia); retenção dos itens e do arquivo
  (decisão do usuário, `docs/SECURITY.md`); aprender alias também do que o operador confirma; a leitura
  em `worker_thread` se a planilha hostil virar problema; rotina de varredura que reavalie prévias em
  aberto caso um pedido se perca (hoje o pedido é atômico com a importação, então não se perde).

## T4.4 — as prévias de carga no painel (2026-10-04)

Commits `cf2e4e8cc` (contrato vermelho), `bb1dcfdc3` (implementação), `f744b86dd` (achados da revisão de design) e o dos
prints/evidência. **Nada da API nem do worker foi tocado.** Decisões em `docs/ai-context/frontend-transportada.md` § "Spec 237 T4.4".

- **Contrato antes, vermelho pelo motivo certo:** `Cannot find module '@/modules/cargo-receiving/shared/cargoPreviewPolling.service'` (puros,
  0 pass / 1 fail) e `Cannot find module …/components/CargoPreviewListPanel.component` (DOM, 0 pass / 1 fail).
- **O que existe** (`modules/cargo-receiving/`, namespace `cargoReceiving.preview.*`, pt-BR e en): `/recebimento/previas` (lista + envio) e
  `/recebimento/previas/:id` (detalhe), com `CargoReceivingNav` (Chegadas | Prévias) no shell; envio (tipo, teto de 960 KiB, `Idempotency-Key`
  por tentativa, 200/413/422, recusa nomeando todos os campos); lista com ordenação, filtros múltiplos, URL e repolling que para sozinho;
  detalhe com grupos por roteiro e carga ligada, selos por situação, "esperando o XML" neutro, erro de linha, confirmar/desvincular (com aviso
  do grupo)/vincular à mão, filtros na URL, "carregar mais itens"; proposta de chegada e chegada pré-preenchida sem data nem hora.
- **Contagem:** `bun run test` **6817 → 6896 pass / 0 fail** (+79, os 7 contratos puros novos) e `test:hooks` **489 → 550 pass / 0 fail** (+61,
  quatro suítes de DOM novas). `bun run typecheck` limpo; `bun run lint` 0 erros (16 avisos antigos, nenhum em arquivo novo); `format:check`
  na raiz ✓.
- **Estabilidade do `test:hooks`:** **12/12 verdes** em sequência (550 pass, 12–13 s) e **4/4 verdes com a CPU saturada** (13 `yes` em 11 núcleos;
  550 pass, 18,5 s). Nenhum `expect(nó).toBeNull()` dentro de `waitFor`: só contagens (`querySelectorAll(...).length`).
- **Mutações** (script fora do repositório; arquivo restaurado por `git checkout` e `git diff --quiet` limpo no fim; "puro" = `bun test` de
  `cargo-receiving.contract.test.ts`, "DOM" = `test:hooks` inteiro):

  | Mutação                                           | Puro | DOM |
  | ------------------------------------------------- | ---- | --- |
  | `Idempotency-Key` nova a cada tentativa           | 0    | 2   |
  | teto do arquivo de 960 KiB para 5 MiB             | 2    | 1   |
  | repolling que nunca para                          | 1    | 2   |
  | "esperando o XML" com tom de erro                 | 0    | 2   |
  | desvincular sem avisar o grupo                    | 0    | 2   |
  | ações visíveis sem `trip.manage`                  | 1    | 1   |
  | pré-preenchimento assume a data e a hora          | 0    | 1   |
  | 200 tratado como envio novo                       | 1    | 0   |
  | botão de propor mesmo sem nota vinculada          | 1    | 1   |
  | vincular à mão sem destacar as candidatas         | 0    | 1   |
  | recado de pré-preenchimento aceita chave a mais   | 1    | 1   |
  | filtro de roteiro de um valor não vai ao servidor | 1    | 0   |

  Todas derrubam teste; nenhuma sobreviveu.

- **Divergências do pedido:**
  1. **A lista NÃO mostra a contagem por estado** (vinculadas/aguardando/…): `GET /cargo-previews` devolve só o resumo (sem `counts`); a
     contagem existe no detalhe. A lista mostra `rowCount` e a situação da leitura. Follow-up de API: `counts` no resumo.
  2. **Candidatas de uma ambígua:** a API devolve só `candidateDocumentIds` (sem número da NF): a tela diz "N notas candidatas" e o seletor
     de vínculo à mão as destaca e põe primeiro ("Candidata"). Nada exigiu mudar a API.
  3. **"Leve à ficha do contratante"** abre `/clientes?tab=contractors` (a aba), não a ficha daquele contratante: a ficha não tem rota por id.
  4. **200 do reenvio:** a tela mostra "Essa planilha já foi enviada." e o botão "Abrir a prévia" (não navega sozinha, para a mensagem ser lida);
     o 201 navega direto para a prévia criada.
  5. **Pré-preenchimento por `history.state`** (sobrevive a recarregar, não vai na URL: seriam até 300 ids). A hora fica VAZIA — a tela de
     registro sem prévia continua com "agora" (contrato de não-regressão).
  6. **Filtros do detalhe:** um valor vai ao servidor (cursor por linha acompanha), vários o cliente filtra o que veio (como a lista de chegadas).
  7. **Cartões no celular** (não pedido literalmente): abaixo de 40rem as tabelas de prévias viram cartões com o rótulo da coluna; a tabela
     larga escondia a situação e as ações atrás da rolagem horizontal.
  8. Primitivos tocados: `FileField` ganhou `describedBy`/`isInvalid` (aditivo, para o erro ser do próprio campo); `CargoSortHeader` e
     `useCargoFieldFeedback` ficaram genéricos (comportamento igual).
- **Prints** (60 PNG em `specs/237-.../prints/`, 375/768/1280 × escuro/claro, dados inventados, API 100% dublada): `previa-lista`,
  `previa-enviar`, `previa-enviar-erro` (cliente: >960 KB), `previa-enviar-erro-413`, `previa-enviar-erro-422`, `previa-detalhe`,
  `previa-detalhe-aguardando`, `previa-vincular-manual`, `previa-propor-chegada`, `previa-chegada-preenchida`. Gerados por
  `test/spec-237-previas-prints.smoke.spec.ts` (fora do smoke da CI; build com `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária, preview na
  porta 53279, config do Playwright descartável apagada no fim; a config da CI e a porta reservada dela não foram tocadas).
- **Revisão de design (web.md §15)** — estilo calculado a 1280 px, escuro, contra a lista de chegadas e a aba Contratantes:

  | Medida                      | Vizinho                                   | Novo                                                           |
  | --------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
  | campo/seletor: altura/borda | 48 px · 1 px lousa · raio 0 · Avenir 14,4 | seletor do envio e campo de arquivo: idêntico                  |
  | botão: altura/padding/raio  | 48 px · 12×20 px · raio 0                 | "Abrir", "Enviar planilha", "Propor chegada": idêntico         |
  | selo: mono/altura           | 11,52 px · 24 px · 1 px                   | idêntico (cor por situação)                                    |
  | aba: altura                 | —                                         | 44 px (`--touch-target`), no molde de `ui/tabs`                |
  | célula de tabela            | 65 px                                     | 65 px (lista) · 83 px (linha do detalhe, tem 2 linhas)         |
  | cabeçalho de tabela         | 61 px (com botão de ordenação)            | 61 px (lista) · 39 px (detalhe: sem ordenação, é de propósito) |

  Contraste (WCAG, mínimo entre as telas), escuro / claro: aba inativa 6,22 / 4,83 · texto secundário 6,22 / 4,83 · dados do roteiro 6,22 /
  4,83 · nota "esperando o XML" 6,22 / 4,83 · selo neutro 6,30 / 5,36 · selo vinculada/pronta 6,59 / 5,50 · selo sugerida/ambígua 6,16 / 5,37 ·
  selo inválida/falhou 4,87 / 4,69 · erro de linha 4,87 / 4,69 · erro de campo 5,46 / 4,69 · motivo da falha 5,55 / 5,27 · indicador de ordenação
  5,87 / 4,57. **Nenhum abaixo de 4,5:1.** **Alvo de toque a 375 px: 46 controles medidos (lista com envio preenchido; detalhe com proposta,
  seletor de nota e aviso de desvincular abertos): o menor tem 44 px**; nenhuma das 62 telas rola de lado (afirmado pelo próprio teste).
  Defeitos achados pelos prints e consertados: (a) seletor de contratante do envio com 38,4 px ao lado do campo de arquivo de 48 px (o
  `SearchableSelect` é compacto por desenho) — tokens locais igualam a altura e o alvo de toque; (b) o rótulo do campo de arquivo era menor que
  o do seletor vizinho; (c) a tabela de 70 rem escondia situação e ações atrás da rolagem a 375 px — virou cartão; (d) o cabeçalho do detalhe
  colava na borda — ganhou painel; (e) parágrafos do rascunho com margem dupla.

- **Não rodou:** `make check`/`make smoke`/smoke da CI, `make migration-test` (nada de banco mudou), teste em aparelho real, o `previewId` no
  `POST /cargo-arrivals` (follow-up de API), integração da API/worker (nada mudou).
- **Follow-ups:** `counts` no resumo da lista (API); número da NF das candidatas de uma ambígua (API); `previewId` opcional no `POST
/cargo-arrivals` para preencher `cargo_previews.arrival_id` (e então "esta prévia já virou a chegada X" no detalhe); rota da ficha do contratante
  por id; fila offline; e-mail (Fase 4b); T4.5 (revisão `opus` + `security-reviewer`, print aprovado).

## Correções da revisão da Fase 4a (2026-10-04)

Revisão de código da Fase 4a (H1, H2, M1–M6, L1–L8 e a pergunta aberta da passada `open`). Commits, na ordem:
`6f26cbf9a` (política: H1, M2, M5, M6, pergunta aberta), `f962ee44c` (worker grava só o par por totais),
`95269f2b4` (desvincular revoga alias e pede reavaliação), `86854181e` (H2 no leitor), `db75b549c` (M1 + defesa do
H2 + migration), `3705a5da7` (M3), `6984626fb` (M4, L2, constantes do L8), `168b41ecc` (L8, divisão do escritor),
`a8c7f528c` (L3), `bb827ac85` (L6), `556c6cd81` (L7), `670f9ced0` (contrato que matou o mutante sobrevivente do
M1) e o desta evidência (ADR, spec e contexto). Decisões no ADR-0094 §4, §7 e §8. A revisão de segurança corre à
parte e não foi tocada aqui.

### O que mudou, e o contrato que prende

- **H1 — par roteiro ↔ carga com XML parcial.** Cenário do revisor (`pairing.ts`): R1 com 20 linhas, só 1 nota da
  carga L1 importada, R2 com 5 linhas e uma coincidente em valor e peso → par `(R2, L1, votes)` pela diferença de
  contagem, linha de R2 `matched` na nota errada, alias errado aprendido, e depois o `known (R2, L1)` deixava as 19
  linhas de R1 em `awaiting_xml` para sempre. Agora: par por votos só com **2 votos e 25% das linhas do roteiro**
  (`MIN_ROUTE_PAIR_VOTES`, `MIN_ROUTE_PAIR_VOTE_PERCENT`); a diferença de contagem saiu do escore (empate sem totais
  não pareia); o worker **grava só o par `totals`** e `selectRoutePairs` ignora linha `votes` gravada por versão
  anterior. Contratos: `cargo-preview-route-pairing-partial.contract.ts` (a carga chegando com 1, 2, 3, 4, 5, 10, 15
  e 20 notas: nenhum passo pareia R2, vincula linha de R2 ou ensina o alias dela; o par certo emerge por votos em
  5 e 10 e por totais em 20; mínimo de votos; contagem não desempata) e, contra Postgres,
  `worker test/integration/cargo-preview-route-pairs.integration.ts` (votos não gravado; totais gravado; linha
  `votes` antiga não volta como conhecida). Vermelho antes: **6 pass / 6 fail** (com só as constantes criadas).
- **Pergunta aberta (passada `open`) e M2.** Valor e peso sem par pelos totais (ou firmado) e sem CEP, razão social
  ou alias viram `suggested` — também dentro de um par por votos. Como `matched` agora sempre tem reforço, o alias
  só é aprendido de vínculo reforçado (não há checagem extra: seria código morto; o mutante "valor e peso sozinhos
  vinculam" derruba 9 testes, inclusive os de alias). Desvincular revoga o alias aprendido por esta prévia
  (`learned_from_preview_id`) para os códigos do grupo desfeito e o CNPJ do destinatário da nota solta, **salvo** se
  outro item `matched` da prévia, do mesmo código, aponta para nota do mesmo destinatário
  (`cargo-preview-unlink.writer.ts`). Contratos: `cargo-preview-match-reinforcement.contract.ts` e
  `api test/integration/cargo-preview-unlink.integration.ts`. Vermelho antes: integração 0 pass / 1 fail (o alias
  `10001` ficava).
- **H2 — número maior que a coluna.** `MAX_INTEGER_DIGITS = 13` valia para todo campo; agora o teto é o da coluna
  (`PREVIEW_DECIMAL_FIELDS`: valor 12, peso 9, volume 8), medido **depois** do arredondamento, e vira `rowError` com
  "Must have at most N digits before the decimal separator". Defesa em profundidade: 22003 no `storeParsed` vira
  `CargoPreviewValueOutOfRangeError` no adaptador e a prévia `failed` `PREVIEW_VALUE_OUT_OF_RANGE`, sem retry. A
  leitura do total da NF-e (`numeric(19,4)`) usa 15 dígitos. Contratos: `cargo-preview-workbook-overflow.contract.ts`
  (EAN-13 em VALOR, 13 dígitos em VALOR, `11987654321` em PESO, 10 dígitos em PESO, 9 em VOLUME, VALOR em texto,
  arredondamento que leva ao dígito a mais, e o limite exato aceito), `worker process-use-case.contract.ts` e
  `worker test/integration/cargo-preview-failure.integration.ts` (22003 real no banco → erro tipado, nada gravado).
  Vermelho antes (contrato contra o código antigo): **2 pass / 7 fail**.
- **M1 — prévia sem estado final.** O consumidor, na tentativa que atinge o `maxRetries` da topologia, marca a prévia
  `failed` `PREVIEW_PROCESSING_ABANDONED` e manda à fila morta. Reenviar o mesmo arquivo de prévia `failed`, ou
  `processing` sem notícia há mais de `CARGO_PREVIEW_PROCESSING_LEASE_MS` (15 min), **reabre a mesma prévia**:
  bytes de novo na chave dela, `queued`, código limpo, evento `uploaded` com `reopened: true` e pedido novo ao
  worker, numa transação com a prévia travada e a situação reconferida; responde 201 (o painel abre o detalhe).
  Pronta, `queued` ou `processing` recente seguem 200 sem pedido novo. Contratos: `cargo-preview-resend.contract.ts`,
  `api test/integration/cargo-preview-resend.integration.ts` (perfil com coluna mal mapeada ⇒ `failed` ⇒ reenviar
  o MESMO arquivo ⇒ reabre; pronta, recente ⇒ 200; parada há 1 h ⇒ 201; o repositório não reabre prévia pronta),
  `worker trail.contract.ts` e `cargo-preview-failure.integration.ts` (coluna mal mapeada ⇒ `failed` ⇒ perfil
  corrigido + reaberta ⇒ `ready`). Vermelho antes: integração 0 pass / 1 fail (`200`/`failed` em vez de
  `201`/`queued`).
- **M3 — a prévia nova roubava a nota.** O `storeParsed` agora vincula todas as prévias prontas da janela, da mais
  antiga para a mais nova (o filtro `previewIds` ficou sem uso e saiu). Contrato:
  `worker test/integration/cargo-preview-order.integration.ts` (pedido recorrente idêntico em duas prévias; a nota
  chega com a reavaliação dela ainda adiada; a leitura da nova a deixa com a antiga). Vermelho antes: 0 pass / 1 fail
  (o vínculo ia para a prévia nova).
- **M4 — coalescência que perde reavaliação.** Só coalesce com pedido que ainda tem
  `CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS` (10 s) de folga, medida por `clock_timestamp()` — o `now()` é
  o começo da transação da importação. A alternativa de o consumidor reagendar por `created_at` posterior à leitura
  foi descartada: `created_at` também é o `now()` da importação, anterior à leitura mesmo comitando depois.
  Contrato: `worker test/integration/cargo-preview-reevaluation-race.integration.ts`, com a intercalação injetada
  (pedido a 2 s de sair; a transação da importação fica aberta enquanto o pedido é publicado e a reavaliação roda;
  depois o commit: tem de sobrar um pedido, e ele vincula a nota); o pedido com folga continua coalescendo; o lote
  de 300 XMLs segue um pedido só. Vermelho antes: 1 pass / 2 fail.
- **M5 — piso que não escalava.** `|Δ| ≤ max(0,01 kg, 0,005 kg × linhas somadas, tolerância × peso)` na partição e
  nos totais do roteiro. Contrato: `cargo-preview-partition-sum.contract.ts` (3 × 1,01 kg contra 3,015 kg ⇒
  `matched`; roteiro de 30 linhas fecha por totais).
- **M6 — linha `matched` sozinha num bloco.** Linhas idênticas do cliente são intercambiáveis (forma canônica pela
  ordem da linha, `cargo-preview-partition-choice.policy.ts`); fora disso, vínculo exige a mesma nota **e** o mesmo
  bloco em toda partição ótima. Contrato: a=300/30, b=c=100/10 contra D=400/40 e E=100/10 ⇒ a e b em D, c em E;
  e linhas não idênticas que trocam de bloco ⇒ ambíguas. Vermelho antes (M5 + M6): **0 pass / 5 fail**. O teste
  antigo "duas partições possíveis: o que todas concordam vincula" afirmava exatamente o defeito e mudou.
- **L2** (`exists` só conta prévia dentro de `match_window_days`), **L3** (sistema 1904 e `t="d"` com hora;
  `cargo-preview-workbook-dates.contract.ts`, vermelho 5 pass / 3 fail), **L5** (desvincular grava pedido
  `reevaluate`), **L6** (`arrival_proposed` uma vez por conjunto de notas, impressão sha256 nos `details`, prévia
  travada na proposta; vermelho 1 pass / 1 fail), **L7** (texto do `arrival_id` corrigido), **L8**
  (`cargo-preview-matching.writer.ts` 218 → 137 linhas, contexto em `cargo-preview-matching-context.query.ts`; o SQL
  cru da reavaliação interpola evento, situações, estados abertos e `system`).

### Migration (exigida pelo M1 e pelo H2)

`20261004165112_cargo_preview_failure_codes`: **só alarga** o CHECK de `cargo_previews.error_code` com
`PREVIEW_PROCESSING_ABANDONED` e `PREVIEW_VALUE_OUT_OF_RANGE` — o CHECK lista os códigos, e sem ela a prévia não
poderia ficar `failed` com eles. Snapshot encadeado em `20261004140624_cargo_previews` (`prevIds` conferido);
`rollback.sql` devolve o CHECK antigo com `NOT VALID` + `VALIDATE` e **recusa sem apagar** enquanto houver prévia com
um código novo. Asserção nova `test/database-migration/cargo-preview-failure-codes.assertion.ts` (aceita os dois,
recusa código inventado, rollback recusa, sem elas desfaz e sai do journal, migra de novo). `make migration-test`:
**124 pass / 0 fail**. `bun run db:generate`: **`no_changes`**. Sem migration destrutiva; a importação de NF-e não
mudou além do pedido de reavaliação (que segue no savepoint).

### Corpus real anonimizado (tolerância 0)

| Medida                                         | FR-24-09 antes  | FR-24-09 depois | FR-28-09 antes | FR-28-09 depois |
| ---------------------------------------------- | --------------- | --------------- | -------------- | --------------- |
| matched / suggested / ambiguous / awaiting_xml | 180 / 5 / 0 / 2 | 177 / 8 / 0 / 2 | 97 / 6 / 2 / 2 | 96 / 7 / 2 / 2  |
| clientes com tudo vinculado                    | 158/165         | 155/165         | 94/104         | 93/104          |
| idem, nos roteiros pareados por totais         | 47/47           | 60/60           | 40/40          | 40/40           |
| pares (totais / votos)                         | 4 / 6           | 5 / 5           | 4 / 4          | 4 / 4           |
| aliases aprendidos                             | 158             | 155             | 94             | 93              |
| FR-28-09 com os aliases de FR-24-09 (matched)  | —               | —               | 99             | 98              |

As 3 + 1 linhas que saíram de `matched` são de par por votos e fechavam só valor e peso, sem CEP, razão social nem
alias — exatamente o que a pergunta aberta manda tornar sugestão. FR.ORLAN passou de votos a totais pelo piso por
linha (M5). Com o XML chegando aos poucos (notas na ordem do número, 10/25/50/75%), `matched` foi 21/45/89/136 →
21/45/88/134 (FR-24-09) e 8/22/46/72 → 8/22/46/71 (FR-28-09): sem piora material, então não houve parada.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout`, `git diff --quiet` limpo)

| Regra                                           | Vermelho | Regra                                         | Vermelho |
| ----------------------------------------------- | -------- | --------------------------------------------- | -------- |
| votos sem mínimo (`score > 0`)                  | 3 fail   | M2 desvincular sem revogar o alias            | 1 fail   |
| sem a fração mínima de 25%                      | 1 fail   | M2 revoga até o alias que outro item sustenta | 1 fail   |
| sem o mínimo de 2 votos                         | 2 fail   | L5 desvincular sem pedir reavaliação          | 1 fail   |
| diferença de contagem volta a desempatar        | 6 fail   | H2 teto único de 13 dígitos                   | 7 fail   |
| valor e peso sozinhos vinculam (passada `open`) | 9 fail   | H2 teto medido antes do arredondamento        | 1 fail   |
| par por votos confirma o grupo                  | 4 fail   | H2 22003 não vira erro tipado (adaptador)     | 1 fail   |
| piso não escala com as linhas                   | 4 fail   | H2 caso de uso não mapeia o erro tipado       | 1 fail   |
| totais do roteiro sem o piso por linha          | 2 fail   | M1 última tentativa não marca abandonada      | 1 fail   |
| bloco pode diferir entre partições              | 1 fail   | M1 sempre retry (sem fila morta)              | 1 fail   |
| sem forma canônica das linhas idênticas         | 2 fail   | M1 `failed` não reabre                        | 1 fail   |
| worker grava par por votos                      | 1 fail   | M1 `processing` reabre sem prazo              | 1 fail   |
| worker lê par por votos como conhecido          | 1 fail   | M1 reabrir sem pedido novo ao worker          | 1 fail   |
| M3 leitura vincula só a prévia nova             | 1 fail   | M1 reabrir sem reconferir na transação        | 1 fail¹  |
| M3 prévias da mais nova para a mais antiga      | 1 fail   | M4 coalesce sem a folga                       | 1 fail   |
| L2 sem o filtro da janela                       | 1 fail   | M4 folga pelo `now()` do começo da transação  | 1 fail   |
| L3 ignora o `date1904`                          | 1 fail   | L3 ISO só sem hora                            | 2 fail   |
| L6 grava o evento a cada proposta               | 1 fail   | rollback da migration sem `VALIDATE`          | 1 fail   |

¹ Sobreviveu na primeira rodada (o caso de uso já filtra antes de chamar o repositório); entrou o contrato que chama
o repositório direto com a prévia pronta (`670f9ced0`).

### Medições e riscos registrados

- **L4 — horizonte do teto de 960 KiB** (as planilhas reais lidas só localmente, nada commitado): FR-24-09, FR-28-09,
  FR-01-10 e FR-05-10 têm 811 818, 798 687, 814 325 e 815 020 bytes; a linha de dado custa ~73 bytes comprimidos na
  aba e 103,6–108,1 contando as strings compartilhadas novas; sobram 168–184 KB, **~1 600–1 700 linhas a mais**
  (≈ 8× o maior dia medido). Anotado no ADR §8.
- **L1 — índice `(company_id, created_at)` em `nfe_documents`: NÃO criado** (tabela central). A consulta das
  candidatas entra por `nfe_participants_company_role_tax_id_idx` (emitente) e filtra `created_at` depois: o custo
  cresce com o histórico inteiro do emitente (277 notas em 2 dias ≈ 50 mil por ano), uma vez por prévia pronta a
  cada reavaliação — e, com o M3, também a cada leitura de prévia (todas as prontas da janela). Não medido contra
  volume real (leitura de produção é proibida; o banco local é pequeno demais para um `EXPLAIN` honesto).
  Follow-up: medir em staging com o volume de um ano e decidir o índice (`CREATE INDEX CONCURRENTLY`, migration à
  parte, custo de escrita na importação).

### Gates

- **API:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato `bun --env-file=../../.env.test test --timeout 120000`:
  antes **9633 pass / 25 skip / 0 fail**, depois **9682 pass / 25 skip / 0 fail** (198 arquivos) · integração da
  prévia, chegada e perfil (`cargo-preview`, `cargo-preview-resend`, `cargo-preview-unlink`, `cargo-arrival`,
  `contractor-receiving-profile`, Postgres do `.env.test`): antes 15, depois **19 pass / 0 fail** ·
  `make migration-test` **124 pass** · `db:generate` **`no_changes`**.
- **Worker:** `bun run typecheck` ✓ · `bun run lint` ✓ · `bun run test`: antes **1611**, depois **1616 pass / 0 fail**
  (paridade com o arquivo novo `cargo-preview-partition-choice.policy.ts`: 22 arquivos idênticos) · integração
  completa `bun run test:integration` num banco **novo** `transportada_worker_integration_r4a` (Postgres local 55432,
  dropado e recriado com `db:migrate` da API, RabbitMQ local): **189 pass / 1 fail** — o que reprova é
  `osrm-routing-matrix` (o OSRM local tem outro mapa), o mesmo da rodada anterior, nada desta mudança; os 8 novos
  (`route-pairs`, `failure`, `order`, `reevaluation-race`) passam.
- **Painel:** os dois códigos novos ganharam texto (pt-BR e en); `bun run test` do `frontend-transportada`:
  **7446 pass / 0 fail**.
- `bun run format:check` na raiz ✓.

### Decisões que divergiram do texto da revisão

- O M1 **exigiu migration** (o CHECK de `error_code` lista os códigos); aditiva, com rollback que recusa sem apagar.
  O evento da reabertura é `uploaded` com `reopened: true` (sem kind novo, o CHECK dos eventos não muda). A marcação
  "fila morta" é feita pelo consumidor na última tentativa, não por um consumidor da fila morta.
- M2: sem checagem extra no aprendizado — `matched` já implica reforço; aprender alias da **confirmação do operador**
  continua follow-up (o texto permite, não exige).
- M4: opção da folga, com `clock_timestamp()`; a do reagendamento pelo `created_at` não fecharia a corrida.
- M6: as duas opções juntas (linhas idênticas intercambiáveis **e** o mesmo bloco em toda partição).
- H2: a leitura do total da NF-e na política passou a aceitar 15 dígitos (`numeric(19,4)`), não 13.
- Linhas `votes` já gravadas em staging não são apagadas (nenhuma mudança de dado): são ignoradas na leitura.

### Não rodou

`make worker-integration` como está (reusa o banco compartilhado com o diário divergente — rodou o mesmo passo em
banco novo, acima); integração completa da API (só as tocadas); `make check`, smoke e teste em staging (nada
publicado — sem push).

### Follow-ups

Índice das candidatas (L1, acima); `previewId` no `POST /cargo-arrivals` para preencher `cargo_previews.arrival_id`
(L7, pendente de verdade); aprender alias da confirmação do operador; limpar as linhas `votes` antigas de
`cargo_preview_route_loads` se a tela passar a mostrar a origem do par; a revisão de segurança em andamento (rodada
separada).

## Correções da revisão de segurança da Fase 4a (2026-10-04)

Revisão de segurança da Fase 4a (S1–S9). Commits, na ordem: `d0364d338` (S1/S4 no leitor + migration dos códigos),
`0cc8e7427` (S1 thread e reentrega), `188520c54` (S2), `508cce42d` (S3), `151f420c4` (S5), `4453ebdb9` (S6),
`0431f3956` (S7), `09ae30058` (S9), `c2fa7ab68` (contrato que matou o mutante sobrevivente do S6) e o desta evidência.
Decisões no ADR-0094 §2, §7 e §8 e no `docs/SECURITY.md`. Os ataques foram reproduzidos com os scripts do revisor
(`bench*.ts`, fora do repositório) e viraram contratos com teto de tempo e de memória afirmado — folgados para a CI,
finitos, e todos estourados pelo código antigo.

### O que mudou, e o contrato que prende

- **S1/S4 — o "teto de 5 s" não existia.** `test/cargo-receiving/cargo-preview-workbook-dos.contract.ts` (API),
  fixture `cargo-preview-attack.fixture.ts`. Vermelho contra o código antigo: **0 pass / 9 fail**, e o primeiro caso
  levou **468,9 s** (o `--timeout` do Bun não interrompe código síncrono). Números (o mesmo arquivo, antes → depois;
  "RSS" é o crescimento medido em volta da chamada):

  | Ataque (comprimido)                                               | Antes (revisor / medido)        | Depois                                        |
  | ----------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
  | 1 linha, ~760 mil células iguais (83–87 KiB)                      | 8,3 min e 2,27 GB / 468,9 s     | 3 ms, RSS +0, `PREVIEW_ZIP_BOMB` (aba 29 MiB) |
  | 1 linha, 80 mil células (9 KiB)                                   | 4,5 s e 530 MB / 4,6 s          | 23 ms, RSS +3 MiB, `PREVIEW_TOO_MANY_CELLS`   |
  | 20 000 linhas × 90 células (120–123 KiB)                          | 1,36 GB / 2,1 s (código errado) | 0 ms, `PREVIEW_ZIP_BOMB` (aba 27 MiB)         |
  | 5 000 linhas × 90 células, dentro dos 8 MiB                       | —                               | 221 ms, RSS +78 MiB, `PREVIEW_TOO_MANY_CELLS` |
  | 2 000 linhas, VALOR/PESO num decimal de 32,7 mil dígitos (20 KiB) | 22,9 s com SUCESSO / 23,7 s     | 375 ms, 0 itens, 4 000 erros de linha         |
  | cabeçalho com 100 mil nomes iguais (direto na política)           | — / 6,7 s                       | < 3 s (ms)                                    |

  Correções, na ordem pedida: `push` no mesmo array no cabeçalho; decimal em texto acima de **40** caracteres é
  inválido antes do regex e do `BigInt`; teto de **512 células por linha** e **120 000 no total**, contado no texto
  (`<c`) antes do `fast-xml-parser`; `budget` passado ao cabeçalho e aos itens, com `check()` por linha; aba
  **8 MiB**, total **16 MiB**, última linha **5 000**. No worker, a leitura (parse + plano) roda numa
  **`worker_thread`** (`threaded-cargo-preview-workbook.gateway.ts`, molde do canhoto) terminada em **10 s**
  (`PREVIEW_PARSE_TIMEOUT`, ack): `test/cargo-preview/threaded-workbook-reader.contract.ts` (worker) prova que o event
  loop roda timers enquanto a planilha pesada é lida e que o teto termina a thread em < 1 s. A reentrega do broker
  (`redelivered`) de prévia já `processing` falha `PREVIEW_PROCESSING_INTERRUPTED` sem reler
  (`process-use-case.contract.ts`, `trail.contract.ts`). Promessa dos 5 s corrigida em `docs/SECURITY.md`, no
  comentário do consumidor e na tabela do ADR §7.

- **Tetos contra as planilhas reais** (cinco `.xlsm` FR, lidas só localmente): aba 3 359 396–3 393 364 bytes (teto
  8 388 608: folga 2,47×), linha mais larga **14** células (teto 512: 36×), células nas linhas com dado 1 658–3 036
  (teto 120 000: 39×), última linha com dado 127–233 (teto 5 000: 21×). As cinco leem como antes (107–215 linhas, 0
  erros), 50–74 ms. Nenhum teto reprovou planilha real.
- **S2 — vínculo quadrático sob a trava.** `test/cargo-receiving/cargo-preview-matching-dos.contract.ts` (API):
  vermelho **2 pass / 3 fail** (8 000 linhas 1 779 ms, 16 000 linhas 6 951 ms; orçamento não consultado). Antes →
  depois (mesmo roteiro e código, 300 notas): 4 000 linhas 443 → 45 ms, 8 000 1 833 → 64 ms, 16 000 7 003 → 133 ms,
  **19 900 9 908 → 165 ms**; 5 000 clientes × 5 000 notas 389 → 42 ms. As notas livres são indexadas uma vez por
  passada (`cargo-preview-free-documents.policy.ts`), `hasOption` e as candidatas do estouro são montados uma vez.
  **Resultado idêntico ao antigo** em 3 000 cenários sorteados pequenos e 400 com clientes de até 300 linhas (script
  diferencial fora do repositório, contra a cópia do domínio do commit anterior). `MatchingBudget` (`check` por
  cliente, por roteiro e por par pontuado). No worker: 5 s por prévia, `SET LOCAL statement_timeout` de 30 s, prévia
  nova que estoura volta inteira e fica `failed` `PREVIEW_MATCH_TIMEOUT` sem itens, a pronta fica como estava
  (`test/integration/cargo-preview-match-budget.integration.ts`, 3 casos).
- **S3 — ReDoS no padrão.** Gramática fechada: `arrival_reference_label` (texto literal, 1..60, sem controle) e
  `literal + \s{0,5}([A-Za-z0-9]{1,30})` em `load-reference.policy.ts`. Contratos: `arrival-reference-label.contract.ts`,
  o bloco "o NroCarga lido do infCpl" de `cargo-preview-matching-rules.contract.ts` (formato real, número no meio e no
  fim, 30 caracteres, 2 000 caracteres, literal, e os dois padrões do revisor como texto: 100 leituras < 1 s), rotas
  do perfil (chave nova obrigatória, chave antiga 400, controle 400, aparado), schema e integração do perfil.
  **Conferido contra 277 `infCpl` reais** (`ID1026570_procNFe_parte1`): 277/277 leituras iguais às do padrão antigo
  `NroCarga[: ]*([0-9]+)`; depois do número vem espaço ou o fim do texto. Migration aditiva
  `20261004180153_contractor_receiving_arrival_reference_label` (rollback recusa sem apagar com texto gravado;
  asserção `contractor-receiving-arrival-reference-label.assertion.ts`). Painel: "Texto que antecede o número da
  carga", ajuda em português, código de campo `controlCharacter`; prints da ficha refeitos (18, os três estados × 3
  larguras × 2 temas; a revisão de contraste do spec passou, 7/7).
- **S5 — envio sem teto.** `rateLimit` 20/300 s `cargo-preview-upload` no Postgres
  (`test/rate-limited-routes.contract.test.ts`) e teto de 5 prévias `queued`/`processing` por contratante, contado e
  gravado sob trava advisory do envio (`test/integration/cargo-preview-upload-limit.integration.ts`: vermelho 0/2; a
  sexta é 422 `CARGO_PREVIEW_TOO_MANY_OPEN` sem objeto nem linha, a repetida é 200, a que terminou não conta, reabrir
  respeita o teto). Painel com o texto do código.
- **S6 —** alias contrariado por vínculo reforçado é apagado (banco e lista da passada):
  `cargo-preview.integration.ts` (worker; vermelho 5/1) e `cargo-preview-alias-conflict.integration.ts`.
- **S7 —** chave do objeto pela linha (`cargo-preview-object.policy.ts`, paridade com a API), `Content-Length` antes
  de baixar e bytes contados ao baixar: `process-use-case.contract.ts`, `storage-reader.contract.ts` (vermelho com
  os demais: 59 pass / 5 fail).
- **S8 —** retenção de PII sem prazo: **decisão pendente do usuário**, registrada no `docs/SECURITY.md` (risco 2 da
  entrada de 2026-10-04). Nada implementado.
- **S9 —** `fflate` 0.8.3 e `fast-xml-parser` 5.10.1 exatos nas duas apps; o lockfile só mudou o especificador e
  `bun install --frozen-lockfile` passa.

### Migrations

`20261004174001_cargo_preview_security_failure_codes` (CHECK de `error_code` alargado com `PREVIEW_TOO_MANY_CELLS`,
`PREVIEW_PROCESSING_INTERRUPTED`, `PREVIEW_MATCH_TIMEOUT`; snapshot encadeado em `a2ffbbfc…`, o da
`20261004165112`) e `20261004180153_contractor_receiving_arrival_reference_label` (encadeada na anterior). As duas
aditivas, com `rollback.sql` que recusa sem apagar. `make migration-test` **124 pass / 0 fail**; `bun run db:generate`
**`no_changes`**.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout`, `git diff --quiet` limpo nos fontes)

| Regra                                       | Vermelho | Regra                                           | Vermelho     |
| ------------------------------------------- | -------- | ----------------------------------------------- | ------------ |
| S1 cabeçalho volta a copiar o array         | 1 fail   | S2 hasOption volta a O(n²)                      | 1 fail       |
| S1 cabeçalho sem orçamento                  | 1 fail   | S2 estouro filtra todas as opções por linha     | 1 fail       |
| S1 itens sem orçamento                      | 1 fail   | S2 índice das notas livres refeito por cliente  | 1 fail       |
| S1 decimal sem teto de texto                | 2 fail   | S2 vínculo sem orçamento por cliente            | 1 fail       |
| S1 sem teto de células por linha            | 2 fail   | S2 roteiro sem orçamento                        | 2 fail       |
| S1 sem teto total de células                | 2 fail   | S2 par pontuado sem orçamento                   | 1 fail       |
| S1 aba volta a 30 MiB                       | 2 fail   | S2 worker: estouro derruba a reavaliação        | 1 fail       |
| S1 total volta a 60 MiB                     | 1 fail   | S2 worker: prévia nova que estoura fica pronta  | 1 fail       |
| S1 última linha volta a 20 000              | 2 fail   | S2 worker: sem statement_timeout                | 1 fail       |
| S1 leitura volta ao event loop (sem thread) | 2 fail   | S2 worker: caso de uso não mapeia o estouro     | 2 fail       |
| S1 teto da thread vira exceção              | 1 fail   | S2 worker: orçamento nunca estoura              | 2 fail       |
| S1 reentrega relê a prévia em processing    | 2 fail   | S3 texto do perfil vira expressão (sem escapar) | não termina¹ |
| S1 consumidor não repassa `redelivered`     | 1 fail   | S3 valor da carga sem gramática fechada         | 3 fail       |
| S5 criar sem teto de abertas                | 1 fail   | S3 texto inválido gravado ainda é usado         | 1 fail       |
| S5 reabrir sem teto de abertas              | 1 fail   | S3 sem o corte de 2 000 caracteres              | 1 fail       |
| S5 rota sem rate limit                      | 1 fail   | S3 texto com caractere de controle aceito       | 7 fail       |
| S5 teto 6 em vez de 5                       | 2 fail   | S3 texto não é aparado no PUT                   | 1 fail       |
| S6 conflito não invalida o alias            | 1 fail   | S7 chave volta a vir da mensagem                | 1 fail       |
| S6 alias invalidado segue na memória        | 1 fail²  | S7 sem conferir o Content-Length                | 1 fail       |
|                                             |          | S7 baixa sem contar                             | 1 fail       |

¹ O padrão hostil do contrato volta a retroceder e o processo de teste não termina (morto à mão) — é o ReDoS
reaparecendo. ² Sobreviveu na primeira rodada (só o banco era afirmado); entrou
`cargo-preview-alias-conflict.integration.ts` (`c2fa7ab68`). Duas otimizações sem guarda mensurável (teto da poda
por contador e escolha por partição em mapa) **saíram** antes do commit do S2: o teto de 5 000 nós já as limita.

### Gates

- **API:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato `bun --env-file=../../.env.test test --timeout 120000`:
  antes **9682 pass / 25 skip**, depois **9690 pass / 25 skip / 0 fail** (198 arquivos) · integração da prévia,
  perfil e chegada (`cargo-preview`, `-resend`, `-unlink`, `-upload-limit`, `cargo-arrival`,
  `contractor-receiving-profile`): antes 19, depois **21 pass / 0 fail** · `make migration-test` **124 pass** ·
  `db:generate` **`no_changes`**.
- **Worker:** `bun run typecheck` ✓ · `bun run lint` ✓ · `bun run test`: antes **1616**, depois **1634 pass / 0 fail**
  (paridade com 23 arquivos idênticos: entrou `cargo-preview-free-documents.policy.ts` e
  `arrival-reference-label.policy.ts`, saiu `arrival-reference-pattern.policy.ts`; chave do objeto e teto conferidos
  contra a API) · integração completa `bun run test:integration` num banco **novo**
  `transportada_worker_integration_s237` (Postgres local 55432, criado e migrado com `db:migrate` da API, RabbitMQ
  local): **193 pass / 1 fail** — o que reprova é `osrm-routing-matrix` (o OSRM local tem outro mapa), o mesmo das
  rodadas anteriores. `bun run build` empacota a thread nova (`dist/cargo-preview/infrastructure/cargo-preview-workbook.worker.js`).
- **Painel:** `bun run typecheck` ✓ · `bun run lint` 0 erros (16 avisos pré-existentes, nenhum nos arquivos tocados) ·
  `bun run test` **6899 + 552 = 7451 pass / 0 fail** (antes ~7446) · `bun run test:hooks` **5 execuções**, 552 pass
  em todas · prints da spec (`spec-237-prints.smoke.spec.ts`, preview próprio na porta 53917) **7/7**.
- `bun run format:check` na raiz ✓.

### Decisões que divergiram do texto da revisão

- **`resourceLimits` não limita nada no Bun 1.3.14** (medido: thread com `maxOldGenerationSizeMb: 64` alocou ~500 MB
  e terminou). A opção vai passada (256 MiB) para quando o runtime a honrar; o teto real de memória são os tetos do
  leitor. O contrato de memória mede o RSS em volta da chamada (< 256 MiB), não a thread.
- **Os dois ataques do revisor que expandem acima de 8 MiB** (760 mil células, 20 000 × 90) agora param no teto de
  bytes (`PREVIEW_ZIP_BOMB`) antes do de células; o teto de células tem contratos próprios dentro dos 8 MiB.
- **Só a leitura vai à thread.** O vínculo intercala consultas ao banco e não cabe numa thread sem banco; ficou com o
  orçamento cooperativo por prévia + `statement_timeout`, a alternativa que o texto admite. A extração do `NroCarga`
  também fica fora: com a gramática fechada ela é linear.
- **Reentrega:** a condição é `redelivered && status = processing`, **sem** "por mais que o lease" — a reentrega após
  uma queda chega em segundos, bem dentro dos 15 min, e o laço de queda continuaria.
- **Prévia pronta que estoura o orçamento numa reavaliação não vira `failed`:** ela tem itens e vínculos, e o reenvio
  que reabre uma `failed` relê o arquivo e regravaria os itens (unique de linha). Fica como estava, a reavaliação das
  outras segue, e o log conta. A prévia NOVA que estoura fica `failed` sem itens.
- **S5:** 422 (não 429) para a fila cheia, para distinguir do rate limit; a contagem é feita sob trava advisory no
  `create` e no `reopen`, não só na checagem prévia.
- **S6:** invalidar = apagar o par (sem evento novo: o CHECK dos eventos não tem kind para isso; o conflito vai ao log
  como antes). A rota `settings.manage` de revogação manual **não** foi feita (follow-up).
- **S3:** busca sem diferenciar maiúsculas (`iu`). Nenhum texto foi copiado do padrão antigo para o novo (a expressão
  não vira texto com segurança): perfil de staging com padrão fica sem leitura do `NroCarga` até alguém preencher o
  texto — o vínculo por conteúdo continua sem ele.

### Não rodou

`make worker-integration` como está (o banco compartilhado tem o diário divergente; o mesmo passo rodou em banco
novo); integração completa da API (só as tocadas); `make check`, smoke da CI e staging (nada publicado — sem push).
O script do revisor `bench3.ts` com 200 dígitos no segundo padrão foi interrompido sem terminar (o revisor mediu 23,6
s com 100).

### Follow-ups

Rota `settings.manage` para revogar alias à mão; preencher `arrival_reference_label` dos perfis de staging que tinham
padrão; limpar a coluna `arrival_reference_pattern` numa migration própria (contração, com aprovação); reavaliar o
`resourceLimits` quando o Bun o implementar; S8 (retenção) aguardando decisão do usuário.

## T5.1 — `GET /cargo-previews/:id/trip-drafts` (2026-10-06)

Commits: `b5e548c0b` (contrato vermelho), `bec9217ac` (implementação), `7b5cd3d76` (contratos que mataram mutantes
sobreviventes). Desenho: `docs/ai-context/api-transportada.md` § "Spec 237 — Fase 5, T5.1". **Nenhuma migration** (`db:generate`
= `no_changes`); o módulo é só leitura.

- **Contrato antes, vermelho pelo motivo certo:** `Cannot find module …/read-cargo-preview-trip-drafts.use-case.js` e
  `…/cargo-preview-trip-draft.routes.js` (0 pass / 2 fail). Registrados nos entrypoints existentes
  (`cargo-receiving.contract.test.ts`, `cargo-receiving-http.contract.test.ts`); no `package.json` só se **acrescentou** o
  arquivo de integração em `test:integration` (o `test` não mudou).
- **Gates:** `bun run typecheck` ✓ · `bun run lint` ✓ · contrato `bun --env-file=../../.env.test test --timeout 120000`: antes
  **9690 pass / 25 skip / 0 fail**, depois **9723 pass / 25 skip / 0 fail** · integração (Postgres do `.env.test`, 65432,
  arquivos passados um a um): `cargo-preview-trip-draft` **5 pass** (não pulou) + `cargo-preview`, `-unlink`, `-resend`,
  `-upload-limit`, `cargo-arrival` → **23 pass / 0 fail** no conjunto · `bun run db:generate` **`no_changes`**.
- **Mutações** (script fora do repositório; cada arquivo restaurado por `git checkout`, `git diff --quiet` limpo):

  | Regra                                                           | Vermelho | Regra                                           | Vermelho |
  | --------------------------------------------------------------- | -------- | ----------------------------------------------- | -------- |
  | tirar o filtro de empresa da prévia                             | 1 fail   | totais do roteiro somam a prévia inteira        | 2 fail   |
  | nota em viagem viva entra nos roteáveis                         | 3 fail   | totais da NF repetem a nota de cada linha       | 1 fail   |
  | nota não autorizada é roteável                                  | 1 fail   | "faltam" conta a sugerida                       | 1 fail   |
  | o gancho de excluídas (RF8a) é ignorado                         | 1 fail   | `canPropose` sem exigir nota roteável           | 2 fail   |
  | `suggested` conta como vinculada (a coluna manda, não o estado) | 1 fail¹  | o resumo repete a nota de dois roteiros         | 1 fail   |
  | ordem instável (notas sem ordenar)                              | 1 fail   | cidade sem normalizar acento e caixa / sem a UF | 1 / 1    |
  | ordem instável (roteiros na ordem de chegada)                   | 1 fail   | soma decimal em ponto flutuante                 | 3 fail   |
  | número da NF comparado como texto                               | 1 fail   | volume ausente vira zero                        | 1 fail   |
  | linha inválida entra nos totais                                 | 1 fail   | "sem roteiro" não vai por último                | 1 fail   |
  | rota de leitura exige `trip.manage`                             | 7 fail   | rota aceita query livre                         | 3 fail   |
  | caso de uso consulta sem a empresa do contexto                  | 1 fail   | prévia ausente não vira 404                     | 1 fail   |
  | notas de qualquer prévia / de qualquer empresa                  | 1 / 1²   | itens ou cargas de qualquer empresa             | 1 / 1²   |
  | nota em viagem viva não é marcada                               | 1 fail   |                                                 |          |

  ¹ o contrato passou a incluir a linha `suggested` com `matched_document_id` gravado. ² sobreviveram na primeira rodada
  (o filtro extra só é visível por consulta, não pela resposta): entrou o contrato de integração que chama as consultas
  com a chave do outro lado e exige vazio.

- **Decisões que divergiram do texto:** (1) `missingCount` é só `awaiting_xml` (o texto diz "esperando o XML"; `suggested` e
  `ambiguous` têm candidata e aparecem nas contagens e no aviso de fora). (2) É **linhas**, não notas: n linhas podem fechar 1 nota.
  (3) `plannedDate` por roteiro é a da prévia (a `RoutingDate` da planilha é o dia do e-mail, não o planejado). (4) Nota
  roteável exige também `status = authorized` (o roteirizador recusa as outras com 409); o texto só falava de viagem viva.
  (5) `:id` que não é UUID canônico nem casa a rota (404, regra do roteador), não é 400. (6) Cidades juntam nota vinculada e
  linha pendente por nome normalizado + UF, com `pendingLineCount`. (7) Prévia não lida devolve `routes: []` com a situação.
  (8) O peso da NF sai de `round(sum(nfe_volumes.gross_weight), 3)`.
- **Não rodou:** integração completa da API (só as tocadas); medição de custo com volume real (sem leitura de produção); teste de
  N+1 por contador de consultas (a estrutura tem uma consulta por tabela, mas nenhum teste conta consultas).

## T5.2 — "Recomendar viagens" no painel (2026-10-06)

Commits: `b94e9778d` (contrato vermelho), `cac45b20d` (implementação). Desenho: `docs/ai-context/frontend-transportada.md` § "Spec 237 T5.2".

- **Como as notas chegam aos fluxos (nada foi duplicado nem alterado neles):**
  - **Criação de viagem:** `navigateToTripCreation` (`trip/shared/tripRoute.service.ts`, o mesmo que a barra de seleção de NF-e já usa) →
    `/trips?createFromDocuments=<ids>`, que o `useTripQuickCreate` já consome (`initialDocumentIds`). O fluxo **já aceitava
    pré-seleção**; nenhuma mudança em `trip`. Vão **só** as `routableDocumentIds` do roteiro.
  - **Roteirizador:** o `MultiVehicleSuggestionAction` existente, com `documentIds` = roteáveis do escopo (todos ou o roteiro escolhido) →
    `POST /route-suggestions/multi-vehicle`. **Única mudança em `routing`: a prop opcional `label`** (padrão "Sugerir viagens"; contrato de
    não-regressão `multi-vehicle-action-label.contract.ts`). Acima de 500 notas o botão desliga e a tela pede um roteiro.
- **Contrato antes, vermelho pelo motivo certo:** `Cannot find module '@/modules/cargo-receiving/hooks/useCargoPreviewTripDrafts.hook'` (DOM, 0 pass / 1 fail) e
  `…/shared/cargoPreviewTripDraftView.service` (puros, 0 pass / 1 fail).
- **Contagem:** `bun run test` **6899 → 6930 pass / 0 fail** (+31) e `test:hooks` **552 → 582 pass / 0 fail** (+30). `tsc --noEmit` limpo; `eslint` 0 erros
  (16 avisos antigos, nenhum em arquivo novo); `format:check` na raiz ✓.
- **Estabilidade do DOM:** nenhum `expect(nó).toBeNull()` dentro de `waitFor` (contagens por `querySelectorAll(...).length`). `test:hooks` **12/12 verdes** em
  sequência (582 pass) e **3/3 verdes com a CPU saturada** (13 `yes` + 4 suítes concorrentes; as 4 concorrentes também 582 pass). O aviso de `act` do
  `HookProbe` (554 ocorrências) é anterior e idêntico com e sem os contratos novos.
- **Mutações** (script fora do repositório; "puro" = `cargo-receiving.contract.test.ts`, "DOM" = `test:hooks`; arquivos restaurados, `git diff` limpo):

  | Mutação                                                      | Puro | DOM |
  | ------------------------------------------------------------ | ---- | --- |
  | roteirizador recebe nota em viagem viva                      | 2    | 5   |
  | criação de viagem recebe também a nota em viagem viva        | 2    | 1   |
  | criação de viagem navega sem as notas (não passa pelo fluxo) | 0    | 1   |
  | "faltam N notas" com tom de erro (`alert` + `role=alert`)    | 0    | 1   |
  | ação visível sem `trip.manage`                               | 1    | 1   |
  | aviso de só leitura some                                     | 0    | 1   |
  | sem teto de 500 / teto 501                                   | 1/1  | 1/1 |
  | aceitar a proposta não relê os rascunhos                     | 0    | 1   |
  | lê os rascunhos antes de abrir                               | 0    | 3   |
  | roteiro escolhido ignorado no escopo / não vai à URL         | 1/0  | 4/2 |
  | botão desabilitado sem o motivo ligado (`aria-describedby`)  | 0    | 1   |
  | motivo desabilitado trocado                                  | 1    | 1   |
  | recomendação oferecida com a prévia ainda sendo lida         | 0    | 1   |
  | "Recomendar viagens" só para quem gerencia                   | 0    | 2   |
  | guarda aceita chave a mais / não confere a nota              | 2/1  | 0   |
  | atalho "ver as linhas" não filtra pelo estado                | 0    | 1   |
  | contagem de "fora" por linha                                 | 2    | 2   |
  | `label` ignorado / texto de sempre trocado                   | 0/0  | 7/3 |
  | cliente manda `companyId` na query                           | 1    | 0   |
  | cartão perde as cidades / "sem roteiro" habilitado           | 0/0  | 1/1 |

  Todas derrubam teste; nenhuma sobreviveu (a primeira rodada falhou em achar um trecho porque o prettier reformatou a linha; refeita).

- **Divergências do pedido:** (1) as visões ficam lado a lado a partir de **64 rem**; no tablet (768) empilham — duas colunas legíveis não cabem. (2) Leitores veem
  as duas visões e uma frase de só leitura; o botão "Usar só este roteiro" também some para eles. (3) O aviso de "notas de fora" fica **acima** das duas visões.
  (4) `CargoPreviewDetailScreen` ganhou `companyId`/`permissions` opcionais (a frota do roteirizador só é lida com a empresa). (5) Usada a porta do roteirizador do
  módulo `routing` (a da seleção de NF-e), como pedido; a de "Montar roteiro" fica como estava (divergência registrada na spec 110).
- **Não rodou:** `make check`/smoke da CI, aceite real de proposta (o dublê do roteirizador nunca responde), teste em aparelho.

## T5.3 — revisão de design (2026-10-06)

`test/spec-237-recomendar-viagens-prints.smoke.spec.ts` (fora da CI; build com `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária, `vite preview` na porta **53281**, config
descartável do Playwright apagada; config da CI e porta reservada intactas; API 100% dublada, dados inventados). 24 PNG em `prints/`:
`recomendar-viagens`, `recomendar-viagens-aguardando` (caso comum: quase tudo esperando o XML), `recomendar-viagens-sem-notas` e `recomendar-viagens-fora`
× 375/768/1280 × escuro/claro. Nenhuma tela rola de lado (afirmado pelo teste).

| Medida (1280, escuro) | Vizinho                                                  | Novo                                                                              |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| painel/cartão         | painel do roteiro: 1 px sólida, raio 0, 12 px            | cartão: 1 px sólida, raio 0, 12 px (seção: 16 px, borda de cobre como a proposta) |
| botão                 | "Propor chegada": 48 px · 12×20 px · raio 0 · Arial 13,3 | "Montar viagem", "Usar só este roteiro", "Gerar proposta", "Fechar": idêntico     |
| selo                  | 24 px · mono 11,52 px · 1 px · 4×8 px                    | idêntico (`CargoPreviewItemStateBadge` reaproveitado)                             |
| "faltam N notas"      | —                                                        | 37 px · borda **tracejada** 1 px · 14,4 px (informação, não alerta)               |

Contraste (WCAG, mínimo entre as quatro telas), escuro / claro: "faltam N notas" 6,22 / 4,83 · motivo da ação desligada 6,22 / 4,83 · dados do roteiro 6,22 / 4,83 ·
rótulo dos totais 6,22 / 4,83 · contagem da cidade 6,22 / 4,83 · dica das colunas 6,22 / 4,83 · selo neutro 6,30 / 5,36 · selo vinculada 6,59 / 5,50 · selo
sugerida/ambígua 6,16 / 5,37 · selo inválida 5,46 / 4,69 · cidade, escopo, aviso de fora e valores 14,48 / 12,66. **Nenhum abaixo de 4,5:1** (o menor: 4,69).
**Alvo de toque a 375 px: 12 controles da recomendação medidos; o menor tem 48 px de altura e 157,3 px de largura.** Defeito achado pelo olhar nos prints e
consertado: roteiros sem totais no dado de teste mostravam "0 kg / R$ 0,00" (o fixture, não a tela) — o fixture ganhou totais e cidades.

## Correções da revisão das Fases 1–2 (2026-10-06) — API, banco e documentação

Branch `work/spec-232-momento-do-evento`, worktree `angry-hamilton-090c30`, sem push. Commits: `71c2cb06d` (M1),
`16d0d6c81` (M5), `9c359adbd` (M7), `61cdbacb8` (contrato do schema que ficou para trás no M1), `16be4ac23` (M3),
`2907f2919` (M4), `add1a6848` (L5–L9) e o commit de documentação desta seção. A parte do painel é de outro executor.

### O que mudou, e o contrato que prende

- **M1 — CHECK com NULL.** Reprodução do revisor (`null-check.ts`, Postgres de teste): as três expressões davam
  `null`. Migration aditiva `20261006144825_cargo_arrival_check_null_holes` (snapshot com `prevIds` →
  `20261006033752_occurrence_type_items_mode`, o fim da cadeia em `origin/staging`; nenhum snapshot novo com dois
  filhos — os três nós com mais de um filho são de agosto/setembro, anteriores): troca `separation_due_at_check`
  (`(janela is null) = (prazo is null) and (prazo is null or extract(...) = janela*3600)`), `state_dates_check`
  (`separated` exige `separated_at is not null`) e `state_shape_check` (`is not null` antes de cada comparação), com
  `SET LOCAL lock_timeout = '3s'` no início e `DEFAULT` no fim; o `rollback.sql` devolve as formas antigas.
  Contrato: `test/integration/cargo-arrival-null-checks.integration.ts` — grava janela sem prazo, prazo sem janela,
  `separated` sem `separated_at`, `received` sem `received_at` e os cinco eventos com estado nulo, esperando
  `23514:<nome do CHECK>` (não "deu erro"); vermelho antes (`Received: "accepted"`, 3 de 3). Estático em
  `static-migration.contract.ts` (pasta nova na lista fixa + teste da forma e do rollback) e o texto exato em
  `cargo-receiving-schema/cargo-arrival.contract.ts`.
- **M3 — filtro e ordem na lista inteira.** `GET /cargo-arrivals`: `contractorId` (≤ 50 UUIDs) e `status` (≤ 4)
  repetidos, `.strict()`, repetição do mesmo valor = 400; `sort` ∈ {`arrivedAt`, `contractorName`,
  `separationDueAt`, `status`} e `direction` ∈ {`asc`, `desc`}, padrão `arrivedAt desc` (o de hoje). Desempate por
  `id` no mesmo sentido; prazo nulo por último nos dois sentidos (como o painel); `status` ordena `open` antes de
  `closed` (o `STATUS_ORDER` do painel). Cursor: na ordem padrão é o `<iso>::<uuid>` de antes (o painel atual
  pagina igual); nas outras, base64url de `[sort, direction, valor, id]`. Cursor de outra ordem (inclusive o antigo
  numa ordem nova) → `400 CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH`; malformado → `400 INVALID_REQUEST`. Contratos:
  `cargo-receiving-http/cargo-arrival-list-routes.contract.ts` (vermelho antes: 4 de 5) e
  `test/integration/cargo-arrival-list.integration.ts` (3 contratantes, 7 chegadas com empate de `arrivedAt`,
  página de 2: filtro de 2 contratantes além da primeira página, as 8 ordenações comparadas com a ordem calculada
  à parte, e cursor com sentido trocado → 400; vermelho antes por 400 no `sort`). Isolamento: o caso multi-filtro
  em `tenant-safety.contract.ts`.
- **M4 — sem N+1 vindo do navegador.** Rota nova `GET /contractor-receiving-profiles?enabled=&limit=&cursor=`
  (`fleet.read`, empresa do contexto): `{ data: [{ contractorId, isEnabled, previewEnabled }], nextCursor }`,
  ordem `contractor_id asc`, cursor = id do último, `limit` ≤ 100 (padrão 25). O agregado `Contractor` e o
  `PATCH /contractors` não mudaram. Contratos: `contractor-receiving-profile-list-routes.contract.ts` (vermelho
  antes: módulo inexistente), caso de uso, `tenant-safety.contract.ts` e
  `test/integration/contractor-receiving-profile-list.integration.ts` (empresa alheia com perfil ligado,
  desligado, ausente; paginação de 1 em 1).
- **M5 — lock da migration da chegada.** `migration.sql` intocada e com o hash preso em
  `PRESERVED_MIGRATION_HASHES`. `rollback.sql` com o `lock_timeout` antes do primeiro `DROP` (contrato estático,
  vermelho antes: `Expected: < 394, Received: 685`). Checagem obrigatória antes de produção em `docs/SECURITY.md`
  (2026-10-06) e ADR-0094 §6 — **pendência operacional do usuário**, nada medido em produção.
- **M7 — concorrência.** `test/integration/cargo-arrival-concurrency.integration.ts` com
  `fixtures/cargo-arrival-race.fixture.ts`: uma transação segura `nfe_documents`/`cargo_arrivals` `FOR UPDATE` até
  `pg_stat_activity` mostrar as duas escritas paradas num lock, e só então solta — a corrida acontece em toda
  execução. (i) mesma chave e pedido → `{200, 201}` e uma chegada; (ii) mesma chave, outro contratante →
  `{201, 409 CARGO_ARRIVAL_KEY_REUSED}`; (iii) dois `batch-status` em ordem inversa → `{200, 200}`, sem deadlock,
  um `document_received` por nota. As rotas montadas para a integração viraram `fixtures/cargo-arrival-http.fixture.ts`.
- **L5:** `received_at = now()` e `separated_at = greatest(received_at, now())` do banco
  (`cargo-arrival-separation-write.support.ts`). Contrato `cargo-arrival-clock.integration.ts`: confere com o
  relógio certo e separa com o processo 1 h atrasado — antes `500` (23514), agora `200` e `separated_at ≥ received_at`.
- **L6:** `CARGO_ARRIVAL_LIMITS.arrivedAtMaxAgeMs` (30 dias) → `422 CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD`
  (`details[{ field: 'arrivedAt' }]`), antes de tocar o banco. A proposta da prévia não grava chegada: o painel
  registra pela mesma `POST /cargo-arrivals`, então o piso vale para ela (único escritor de `cargo_arrivals`).
- **L7 — formato novo, o painel precisa ajustar:** o `409 CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS` passa de
  `details[{ field: 'documentIds.<n>', message: <uuid da NF-e> }]` para
  `details[{ field: 'pendingDocumentIds.<n>', message: 'The document is not separated yet', documentId: <uuid da NF-e> }]`.
- **L8:** `NFE_DOCUMENT_AUTHORIZED_STATUS` (`nfe-documents/domain/nfe-document-status.constant.ts`, no molde do
  worker) no lugar das quatro cópias de `AUTHORIZED_STATUS` em `cargo-receiving/`; `buildArrivalDocumentFilters`
  mudou para `cargo-arrival-persistence.support.ts` e as escritas da separação o usam (o `documentScope` saiu).
- **L9:** `classifyArrivalCandidate`, `isSameRules` e `indexesOf` recebem objeto.
- **L12:** `docs/ai-context/api-transportada.md` — a 244 e a 239 voltaram a seções próprias depois da 237 Fase 2;
  a linha órfã do contrato da Fase 1 voltou ao lugar; nenhum texto alheio perdido (conferido por contagem de
  caracteres sem espaço antes/depois do movimento).
- **L13:** `tasks.md` T1.5/T2.5 marcadas com a referência (deploy verde em staging `7cf745ec8` e `cbfd4f356`);
  T2.6 bloqueada por decisão (M6).

### Mutações (cada arquivo restaurado; `git diff --quiet` / `cmp` limpos)

| Regra        | Mutação                                                                   | Resultado                                        |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------ |
| M1 prazo     | tira `(janela is null) = (prazo is null) and` da migration                | vermelho (1 de 3)                                |
| M1 datas     | tira `"separated_at" is not null and`                                     | vermelho (1 de 3)                                |
| M1 eventos   | tira os `is not null` do ramo `document_separated`                        | vermelho (1 de 3)                                |
| M5           | rollback com o `lock_timeout` depois dos `DROP TABLE` (o estado anterior) | vermelho                                         |
| M7 (i)       | tira `for('no key update')` do contratante no registro                    | vermelho (`{201, 409}`)                          |
| M7 (ii)      | tira o mapeamento `23505 → key_reused`                                    | vermelho (500)                                   |
| M7 (iii)     | tira só a trava da chegada                                                | **verde** — a trava das notas serializa sozinha  |
| M7 (iii)     | tira só a trava das notas                                                 | **verde** — a trava da chegada serializa sozinha |
| M7 (iii)     | tira as duas                                                              | vermelho (dois eventos por nota)                 |
| M3 filtro    | ignora `contractorIds`                                                    | vermelho                                         |
| M3 keyset    | tira o desempate por id do cursor                                         | vermelho                                         |
| M3 nulos     | `nulls first`                                                             | vermelho                                         |
| M3 cursor    | aceita cursor de outra ordem                                              | vermelho (HTTP e integração)                     |
| M4 empresa   | tira o filtro de empresa                                                  | vermelho (integração e isolamento)               |
| M4 `enabled` | ignora o filtro                                                           | vermelho                                         |
| M4 cursor    | `gt` → `gte`                                                              | vermelho                                         |
| L5           | `separated_at` volta a `params.now`                                       | vermelho (500)                                   |
| L6           | desliga o piso                                                            | vermelho                                         |
| L7           | volta ao formato antigo                                                   | vermelho                                         |

L8/L9/L12 são refatorações sem regra nova: cobertas pelos contratos existentes (todos verdes).

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` e `bun run lint` (API): limpos.
- Contrato (`bun --env-file=../../.env.test test --timeout 120000`): **antes 9763 pass / 25 skip / 0 fail**
  (199 arquivos); **depois 9779 pass / 25 skip / 0 fail** (199 arquivos).
- Integração, arquivos passados um a um: antes `cargo-arrival` + `contractor-receiving-profile` = 9 pass / 0 fail;
  depois os 12 tocados (`cargo-arrival`, `-null-checks`, `-concurrency`, `-list`, `-clock`,
  `contractor-receiving-profile`, `-list`, `cargo-preview`, `-trip-draft`, `-unlink`, `-resend`, `-upload-limit`)
  = **35 pass / 0 fail**, contra o Postgres do `.env.test` (`localhost:65432`, bancos descartáveis por teste).
- `make migration-test`: 126 pass / 0 fail (aplica tudo, roda todos os rollbacks em ordem inversa, reaplica).
- `bun run db:generate` = `no_changes`; `bun run format:check` na raiz: limpo.

### Decisões que divergiram do texto da revisão

- **M1, NOT VALID:** usado (`ADD … NOT VALID` + `VALIDATE`), no molde de `20261003010806`. Ressalva honesta: a pasta
  roda numa transação, então o NOT VALID não encurta o lock (o ACCESS EXCLUSIVE do ADD dura até o COMMIT); o ganho
  é o deploy reprovar no `VALIDATE` do CHECK certo se houver linha antiga fora da forma. Não li staging para saber
  se há linhas — o código sempre gravou as três colunas, então não se espera nenhuma.
- **M1, datas:** o texto pedia `separated` com `received_at is not null and separated_at is not null and
separated_at >= received_at` e `received` com `received_at is not null` — o `received` já recusava NULL; só o
  `separated` ganhou o `is not null`.
- **M3, status:** com só dois valores (`open`, `closed`), o teto de 4 vale como pedido, mas valor repetido é 400.
- **M3, cursor padrão:** a ordem padrão mantém `<iso>::<uuid>` (compatível com o painel atual); um cursor no
  formato novo com a ordem padrão é recusado como `mismatch`, porque o servidor nunca o emite.
- **M4:** rota nova (a preferida), resumo sem o nome do contratante — o painel já carrega a lista de contratantes.
  `enabled` é opcional (`true`, `false` ou ausente = todos os perfis).
- **M7 (iii):** o texto pedia prova por mutação da trava `for no key update`; a trava da chegada e a das notas são
  redundantes para este caso, e só tirar as duas fica vermelho (registrado na tabela).
- **L7:** o id vai em `documentId`, campo a mais no item de `details` (o tipo `ApiErrorDetail` não mudou; o item é
  subtipo dele).

### Follow-ups registrados

- **M6 (decisão do usuário):** cidade do grupo pelo `<enderDest>` × destino físico `<entrega>` — `tasks.md` T2.6,
  ADR-0094 §6. Nada mudou no código.
- **L10:** identificadores com mais de 63 bytes na migration do perfil (`20261003170340_contractor_receiving_profiles`;
  o Postgres trunca o nome) — corrigir numa migration de contração futura, nunca editando a aplicada.
- **L11:** a migration do perfil não tem cabeçalho de copyright — idem, só numa migration futura (editar muda o hash).
- `test/separator-role.contract.test.ts` não importa as rotas do perfil (`GET /contractors/:id/receiving-profile` e
  a nova `GET /contractor-receiving-profiles`, ambas `fleet.read`, alcançáveis pelo separador) — lacuna anterior a
  esta rodada; acrescentá-las pede a decisão por escrito que o contrato exige.
- Cursor da lista por `Date` em ms: `arrived_at`/`separation_due_at` nascem com precisão de ms (vêm do corpo e de
  conta em JS); se algum escritor futuro gravar µs, o cursor precisa do texto com µs (como `/trips/:id/timeline`).

### Não rodou

Push e deploy (proibidos nesta rodada); smoke e `make check` completo; integração inteira da API (só os 12
arquivos tocados); o painel (fora do escopo — o formato novo do 409 e as rotas novas ainda não são consumidos);
nenhuma leitura de staging nem de produção (a checagem do M5 é do usuário).

## Correções da revisão das Fases 1–2 — painel (2026-10-06)

Branch `work/spec-232-momento-do-evento`, sem push. Consome a API corrigida (`71c2cb06d..b1d6b538e`); nada da API foi
tocado. Commits do painel: `b91e4ad20` (M2 + L7), `6e028f3df` (M3), `d5e01e575` (M4 + L4), `22f2b6001` (L1–L3),
`c3b3a6367` (L6), `87bee4210` (L9 + L14), `8e58e03f8` (lote também nomeia as notas), `5cc1fdfe1` (M4 na terceira tela) e o
commit de documentação e prints desta seção. A API respondeu como descrito: formato lido dos schemas
(`cargo-arrival-list-query.schema.ts`, `contractor-receiving-profile-list.routes.ts`, `cargo-arrival.error.ts`).

### O que mudou, e o contrato que prende

- **M2 — erro de rota e de lote.** Antes `route.mutate`/`batch.mutate` não tinham erro: a chegada fechada por outra pessoa,
  o 422 e a queda de rede sumiam calados. `CargoActionFailure` mostra o aviso (`errors.<code>`), nomeia TODAS as notas
  recusadas pela posição na seleção **enviada** (`documentIds.<n>`), deduplica, dá atalho que rola e foca, mostra o campo
  desconhecido com o nome cru e fica em silêncio sem campo; editar a seleção limpa o aviso. Contrato de DOM
  `trip-hooks/cargo-arrival-detail-errors.contract.ts` (409 `CARGO_ARRIVAL_CLOSED`, 422, `REQUEST_FAILED`, código
  desconhecido, retentativa que dá certo, lote com 422 por nota). Vermelho antes: 16 de 16 (ver "Mutações").
- **L7 (painel).** O leitor do 409 do fechamento lê `details[].documentId` (`pendingDocumentIds.<n>`); nunca o texto da
  mensagem. Contratos: `cargo-receiving/refusal.contract.ts`, `client.contract.ts` (o `documentId` atravessa o cliente) e o
  DOM do fechamento.
- **M3 — filtro e ordenação no servidor.** Todos os contratantes e situações vão repetidos, `sort`/`direction` vão com o
  cursor, trocar o critério recomeça a paginação, e `CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH` recarrega do início com aviso
  neutro. O filtro/ordenação no cliente **saiu** (sem rede de segurança: ela mascararia o defeito). Contratos:
  `cargo-receiving/arrival-table.contract.ts`, `client.contract.ts` e o DOM `cargo-arrival-list.contract.ts` sobre
  `cargoArrivalListDouble.helper.ts` (servidor dublado que filtra, ordena e pagina como a API — sem ele o painel "passava"
  filtrando sozinho). Prova de "além da primeira página": 3 chegadas novas de outro contratante na frente, página de 2,
  filtro Alfa + Beta — as duas aparecem sem "carregar mais".
- **M4 — uma consulta de perfis.** Registro de chegada, envio da planilha e selo da aba Contratantes usam
  `GET /contractor-receiving-profiles`. Contrato `trip-hooks/receiving-profile-requests.contract.ts`: com **150 contratantes**
  o painel faz ≤ ⌈150/100⌉ = 2 chamadas de perfil e 2 de contratantes, e **zero** leituras de perfil por contratante na aba
  (`profileReads` do dublê = 0).
- **L4.** `RECEIVING_PROFILES_QUERY_KEY` (`modules/shared`) é a raiz das duas listas; o PUT invalida a raiz. Contrato: os dois
  módulos relêem a lista depois do `PUT` (mesmo `QueryClient`, dois dublês).
- **L1** "Separar tudo do grupo" desabilitado com toque do mesmo grupo em voo; **L2** `isSeparationOverdue` zera quando
  `separated === total`; **L3** leitura periódica de 20 s (`CARGO_ARRIVAL_LIMITS.detailRefetchIntervalMs`) só com chegada
  aberta, aba visível e sem toque em voo, e a recusa por transição diz "a nota já avançou". Contratos:
  `trip-hooks/cargo-separation-concurrency.contract.ts` e `cargo-receiving/arrival-polling-and-overdue.contract.ts`. O
  intervalo é provado avaliando a opção `refetchInterval` que a tela deu ao TanStack Query contra a consulta viva, sem
  esperar 20 s de relógio.
- **L6.** Piso de 30 dias no formulário (`arrivedAtMaxAgeDays/Ms`, cópia por valor da API) e o 422
  `CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD` dito no campo da data, pt-BR e en.
- **L9/L14.** Seis funções passaram a receber objeto (mais a interna `outcomeOf`); `CONTRACTOR_MANAGE_PERMISSION`.

### Mutações (cada arquivo restaurado depois de cada rodada; a coluna é o número de testes que reprovaram)

| Regra                   | Mutação                                                  | Reprovados |
| ----------------------- | -------------------------------------------------------- | ---------- |
| M2 erro de rota mudo    | `routeErrorCode: undefined`                              | 12         |
| M2 erro de lote mudo    | `batchErrorCode: undefined`                              | 3          |
| M2 editar a seleção     | `toggleDocument` não limpa o aviso                       | 2          |
| L7 leitor do fechamento | lê `detail.message` em vez de `documentId`               | 3          |
| M3 vários contratantes  | só vai o filtro quando é um valor                        | 3          |
| M3 ordem                | `order` nunca vai ao servidor                            | 15         |
| M3 cursor com a ordem   | `sort`/`direction` só na primeira página                 | 2          |
| M3 aviso de ordem       | mismatch sem recarregar do início                        | 1          |
| M3 situações            | `status` repetido some da query                          | 1          |
| M4 filtro `enabled`     | consulta sem `enabled=true`                              | 2          |
| M4 paginação            | só a primeira página de perfis                           | 1          |
| M4 cruzamento           | todos os contratantes entram                             | 3          |
| M4 N requisições (aba)  | uma leitura de perfil por contratante dentro da consulta | 1          |
| M4 selo                 | selo ignora a lista                                      | 2          |
| M4 prévia               | elegível sem exigir `previewEnabled`                     | 2          |
| L4 invalidação          | `PUT` não invalida a raiz                                | 1          |
| L1 separar tudo         | tira o `disabled`                                        | 2          |
| L2 vencida              | `isSeparationOverdue` sem recálculo                      | 2          |
| L3 polling que não para | tira a parada por chegada fechada                        | 3          |
| L3 toque em voo         | relê com toque em voo                                    | 2          |
| L3 aba escondida        | relê com a aba escondida                                 | 2          |
| L3 sem polling          | a consulta nunca recebe o status                         | 2          |
| L3 texto                | volta "a etapa não pode voltar"                          | 1          |
| L6 piso                 | validação sem o piso de 30 dias                          | 2          |
| L6 motivo do servidor   | 422 sem texto próprio no campo                           | 1          |
| L6 constante            | piso de 31 dias                                          | 3          |

⚠️ Uma mutação inicial de M4 ("N leituras") passou verde por ser inócua — a chave da consulta não incluía os ids, e o
corpo nunca viu a lista. Refeita com os ids na chave (como seria uma regressão de verdade), reprovou. Registro honesto:
uma mutação que não reprova é mutação mal feita, não regra provada.

### Estabilidade do DOM

`bun run test:hooks`: **10 execuções seguidas, todas 658 pass / 0 fail**, e mais 6 com a CPU ocupada por processos `yes`
em paralelo (3 com 11 e 3 com 22, isto é, 1× e 2× os núcleos): 6 de 6 verdes. Sem `expect(nó).toBeNull()` dentro de
`waitFor` (as ausências afirmam `querySelectorAll(...).length`). Ocorrência a registrar: numa primeira tentativa com 22
processos de carga, duas das quatro execuções não deixaram o resumo de `pass`/`fail` na saída que eu filtrava (o log não
foi guardado, causa não apurada); repetidas, as mesmas seis execuções com carga passaram com o log salvo.

### Revisão de design (prints, `getComputedStyle`)

Prints: `prints/recebimento-erro-rota-{375,1280}-{dark,light}.png` e `recebimento-erro-lote-…` (oito PNGs, dados fictícios),
gerados por `test/spec-237-recebimento-erros-prints.smoke.spec.ts` (fora da CI): build com `VITE_SMOKE_AUTH_BYPASS=true` em
pasta temporária, `vite preview` em porta própria (53311), API dublada, config do Playwright descartável apagada.

- **Vizinho:** o aviso novo (`[data-action-failure] p[role=alert]`) tem estilo calculado **idêntico** ao aviso do fechamento
  (mesma tela): `color rgb(255, 95, 87)`, `font-size 16px`, `font-family "Avenir Next"`, margem e padding 0; o rótulo "Notas
  recusadas" também. É a mesma classe (`.error`/`.refusal`) que o registro de chegada já usa.
- **Contraste (WCAG):** escuro **5,46:1**, claro **4,69:1** — aviso, rótulo, atalho e motivo, todos ≥ 4,5:1 (o teste reprova
  abaixo disso).
- **Alvo de toque a 375 px:** os atalhos das notas medem **44 px** de altura (`--touch-target`); o teste reprova abaixo de 44.
- **Rolagem horizontal:** nenhuma, nos oito prints (o teste reprova com `scrollWidth > clientWidth`).
- Olhado nos PNGs de 375 escuro e 1280 claro: o bloco do erro fica entre a barra de ações e os grupos, sem competir com a
  barra de seleção (que leva a borda de cobre). Pendência de design registrada, não consertada: o aviso é texto vermelho
  sem superfície, igual ao do fechamento e do registro — consistente com os vizinhos, mas um cartão de erro único para as
  três telas seria decisão de design própria.
- A tela da lista mudou de forma visível em dois pontos, sem print novo (fora do pedido): **Notas e Separadas deixaram de ser
  clicáveis** e o contador diz "N chegadas carregadas".

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` (painel): limpo. `bun run lint` (painel): 0 erros (16 avisos antigos). `bun run format:check` (raiz):
  limpo.
- `bun run test` (painel): **antes 6972 pass + 612 (test:hooks) / depois 6985 pass + 658**, 0 fail nos dois.

### Decisões que divergiram do texto

- **Notas e Separadas deixaram de ordenar.** O servidor ordena por 4 colunas; as outras duas (contagens) não existem lá, e
  mantê-las só sobre as páginas carregadas era exatamente o defeito do M3. Alternativa (follow-up da API): `sort` por
  `documentsTotal`/`separatedRatio`.
- **Sem rede de segurança no cliente** (o texto admitia mantê-la com comentário): ela esconderia justamente a regressão que o
  contrato precisa ver.
- **M4 também na tela de envio da planilha** (`usePreviewContractors`), que o texto não nomeava: era o mesmo N+1 e a rota
  nova traz `previewEnabled`. `readProfileFlags` saiu do cliente da prévia.
- **Lote também nomeia as notas** (`actionRefusal`), como pedido em "e os `details` por nota". ⚠️ A API não devolve `details`
  por nota no batch (o resultado por nota vem no 200); o print `recebimento-erro-lote` usa um 422 sintético só para mostrar o
  desenho, e o DOM prova o caminho — o cenário de rede caída está no contrato.
- **L6:** o motivo vai ao campo da data (`describeServerFieldIssues`), e o aviso genérico continua suprimido quando há campo
  nomeado (comportamento existente); o texto `errors.CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD` cobre o 422 sem `details`.
- O contador "N de M chegadas carregadas" virou "N chegadas carregadas": com o filtro no servidor, "de M" não existe.

### Follow-ups

- API: ordenar por contagens (notas, separadas) para devolver as duas colunas à tabela.
- Os dois prints novos mostram o erro; o print `recebimento-lista-*` (spec 237 T2.4) não foi refeito com os cabeçalhos sem botão.
- `test/spec-237-recebimento-prints.smoke.spec.ts` ganhou o mock de `/contractor-receiving-profiles` (sem ele o registro ficava
  sem contratante); não foi rodado de novo.

### Não rodou

Push e publicação (esperam o "pode publicar"); smoke da CI e `make check` completo; `bun run test:integration`/API (não
mexi); prints refeitos das demais telas; nenhuma leitura de banco, staging ou produção.

### Tabelas cortadas a 375 px — correção (2026-10-06, depois da conferência dos prints)

**Defeito.** No print `recebimento-erro-rota-375-dark` a tabela de notas do detalhe do escritório perdia a coluna
"Situação" e truncava "Destinatário". O teste "sem rolagem horizontal" passava porque o conteúdo estava **recortado**, não
encaixado. A prova anterior era insuficiente: `scrollWidth <= clientWidth` não vê o que um ancestral esconde.

**Quais telas tinham o corte** (medido com a geometria real, antes da correção, a 375 px):

| Tela                                                                        | Tabela               | Antes                                                                            |
| --------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `/recebimento/:id/detalhe` (e os dois prints de erro)                       | grupos rota × cidade | terminava em 669 px para um limite de 346: Situação e parte do Destinatário fora |
| `/recebimento` (lista de chegadas)                                          | chegadas             | terminava em 778 para 359: Separadas, Prazo, Situação e Ações fora               |
| `/recebimento/nova` (registro, com e sem recusa, e com a prévia preenchida) | notas livres         | terminava em 480 para 342: Cidade e Valor fora                                   |
| prévias (lista, envio, detalhe, vincular, propor) e celular do separador    | —                    | **sem corte** (já usavam `.stacked`; o celular usa cartões próprios)             |

**Correção.** As três tabelas passaram a `.stacked` (cartões com o rótulo da coluna abaixo de 40 rem, o mesmo mecanismo das
prévias) e cada célula ganhou `data-label` com o texto do cabeçalho da coluna. No detalhe, a largura mínima e as colunas fixas
deixaram de valer no celular (`--stacked-min-width` e `table-layout: fixed` só a partir de 40 rem) — o `min-width: 40rem` era
o que forçava a tabela a ser mais larga que a tela. O selo "Já em viagem" fica com a Situação. O detalhe não tem coluna de
cidade por nota: a cidade é o título do grupo.

**Contrato (vermelho antes, pelo motivo certo).**

- Geometria real, `test/cargo-clipping-smoke.helper.ts` (`expectNoClipping`): nenhum elemento visível de `main` termina além
  (`getBoundingClientRect().right`) do ancestral que o recorta ou rola, e a página não rola de lado. Roda a 375 px em TODAS as
  telas dos três specs de prints (recebimento, prévias, erros). Antes da correção reprovou as telas da tabela acima e passou as
  outras. `expectEveryNoteStateVisible` afirma que cada nota do detalhe tem a situação visível e com texto.
- DOM (`test:hooks`): `readCardLabels` — cada célula com conteúdo leva o `data-label` da coluna dela (lista, grupos do
  detalhe, só leitura sem a caixa, notas livres do registro).
- ⚠️ Os módulos CSS valem `undefined` no `bun test`: a classe `.stacked` não é afirmável pelo DOM do happy-dom, que também não
  calcula layout. Por isso a prova de corte é a do navegador (spec fora da CI, como os prints), e o contrato de DOM prende só o
  que o happy-dom enxerga (rótulos).

**Mutações** (arquivo restaurado depois de cada uma; o spec de geometria reprovou 1 de 1 em cada):

| Mutação                                                                         | Resultado                |
| ------------------------------------------------------------------------------- | ------------------------ |
| grupo do detalhe sem `.stacked`                                                 | vermelho (geometria)     |
| detalhe volta a `min-width: 40rem; table-layout: fixed` (tabela larga de volta) | vermelho (geometria)     |
| lista sem `.stacked`                                                            | vermelho (geometria)     |
| notas livres do registro sem `.stacked`                                         | vermelho (geometria)     |
| célula da situação sem `data-label`                                             | vermelho (DOM, 2 testes) |

**768 px.** Detalhe, registro e celular encaixam sem rolagem. A lista de chegadas e as telas de prévia **rolam dentro da região
rotulada** (`role=region`, `tabindex=0`; larguras mínimas de 56 a 70 rem por decisão das prévias): não perdem coluna, mas exigem
rolagem — registrado, sem mudança (a lista a 768 ainda mostra a tabela larga; levar o ponto de quebra dela a 64 rem é decisão de
design à parte).

**Revisão de design (`getComputedStyle`, detalhe a 375).** Linha `display: grid`, tabela `display: block`, colunas
`104px 181px` (a mesma grade `.stacked` das prévias); rótulo `SFMono-Regular` 12 px, contraste **6,22:1 (escuro) e 4,83:1
(claro)**; valor 14,48:1 e 12,66:1. A quebra de linha do destinatário acontece dentro da coluna de valor. Prints refeitos e
olhados (detalhe/erro de rota 375 e lista 375): cartões legíveis, nenhuma coluna fora da tela.

**Prints refeitos:** `recebimento-detalhe-{375,768}-{dark,light}`, `recebimento-lista-{375,768,1280}-{dark,light}` (cabeçalhos
Notas/Separadas sem botão de ordenação, contador "N chegadas carregadas", cartões a 375),
`recebimento-registrar-chegada-375-{dark,light}`, `recebimento-registrar-recusa-375-{dark,light}` e os oito
`recebimento-erro-{rota,lote}-{375,1280}-{dark,light}`.

**Estabilidade:** `test:hooks` 10 execuções seguidas 662 pass / 0 fail e 3 com 22 processos `yes` em paralelo (2× os núcleos),
662 / 0. `bun run test`: 6985 pass + 662 (antes desta correção: 6985 + 658). Typecheck, lint (0 erros) e `format:check` limpos.
Os specs de prévias e de recebimento ganharam o mock de `/contractor-receiving-profiles`: sem ele, depois do M4, as telas de
envio ficavam sem contratante e o smoke estourava o prazo.

## T3.1 — o desenho da avaria na entrada e da marcação "devolver ao contratante" (2026-10-06)

Desenho completo em `docs/adr/0094-o-recebimento-da-carga-antes-da-viagem.md` §9 (9.1–9.6). Resumo e medidas:

- **Medido antes de decidir:** `trip_document_occurrences` tem 35 leitores em `src/` e é alvo de cinco FKs de outras specs
  (tratativa 164, fotos 161, itens 166/172, correções 167/240, cobrança 164 T17) e da conversa 183 por `occurrence_id`.
  Experimento de tipo (revertido por `git checkout`, árvore limpa): com `trip_document_id` anulável e `receiving` em
  `TRIP_OCCURRENCE_STAGE`, `bun run typecheck` deu **7 erros em 6 arquivos**; com uma etapa só no tipo da coluna, **16 em 8**.
- **(a) Dono da ocorrência:** coluna irmã `cargo_arrival_document_id` + `trip_document_id` sem `NOT NULL` + CHECK
  `num_nonnulls(...) = 1` + CHECK etapa ⇔ dono, FK para `cargo_arrival_documents (company_id, id)`. Descartada a tabela
  irmã: duplicaria 164/161/166/167 ou exigiria FK polimórfica em cinco tabelas, e o portal uniria duas fontes. Seguro nos
  dados por construção (o `NOT NULL` vigente garante os CHECKs novos), sem leitura de staging/produção.
- **(b) Etapa:** `receiving` em `TRIP_OCCURRENCE_STAGE` (gera os dois CHECKs). Descartado reaproveitar `separation` (vazaria o
  tipo para a viagem, `leaves_document_behind` e `dispatch-readiness` leem `separation`). Catálogo de recebimento semeado por
  bootstrap (três tipos, `blocked`, `items_mode optional`).
- **(c) Marcação:** coluna ortogonal `return_to_contractor none|marked|returned` + `return_occurrence_id` com FK para a
  ocorrência **desta** nota. Descartado estado novo no eixo (reescreveria a política de transição, o CHECK de datas e o de forma
  dos eventos, e perderia o "separada" da nota marcada depois de separada).
- **(d) Por nota inteira**, com os itens na ocorrência de origem. Descartado por item: nenhum fluxo de viagem/CT-e divide a NF-e.
- **(e)** leitura `fleet.read`; abrir/marcar/concluir `trip.manage`; desfazer `occurrences.resolve`; concluir só com a
  tratativa `decided|closed`; `Idempotency-Key` em `idempotency_records`; trava chegada → nota; janela só para abrir.
- **(f)** a decisão do portal não mexe na marcação (follow-up).

**Revisão `oh-my-claudecode:architect` (opus), passada separada, só leitura: APROVADO COM AJUSTES.** Todos os oito obrigatórios
acolhidos e escritos no ADR §9.5: (1) `listOccurrenceTypes` filtra `delivery|separation` e o `UPDATE` de `saveOccurrenceType`
não alcança tipo `receiving` — sem isso a semente derrubava a tela de tipos do painel (guarda `every(isOccurrenceType)`);
rota própria para os tipos de recebimento; (2) rota `GET /cargo-arrivals/:id/occurrences` com `caseId`/`caseStatus` (o feed do
escritório exige viagem, e a tratativa ficaria inalcançável); (3) pelo menos um item (`blocked` sem item trava no envio ao
contratante); (4) ordem da abertura com o reenvio idempotente antes da janela, e `23505` da chave → 409; (5) pendente contado
pronto; (6) **a leitura `GET /cargo-arrivals/:id` não ganha chave** — as guardas de chave exata do painel derrubariam
`/recebimento`; a marcação sai na rota própria; (7) `rollback.sql` declarado destrutivo, com guarda; (8) desfazer com
`occurrences.resolve`. Recomendados acolhidos: R1 (abre só em nota `received|separated`), R2, R3, R4, R5, R6.

**Divergências do texto do pedido (decididas aqui, com o porquê):** a leitura da chegada **não** passa a trazer
`returnToContractor`/ocorrências/contagens (ajuste 6: quebraria o painel publicado; vão na rota de ocorrências); desfazer **não**
é do separador (ajuste 8); o feed `GET /trip-occurrences` não mostra a ocorrência de recebimento (contrato dele exige viagem e
placa; a tratativa é conduzida pela rota nova + ações existentes).

## T3.2 — migration e API da avaria sem viagem e da marcação "devolver ao contratante" (2026-10-06)

Commits: `9ce8f792c` (schema, migration, ajustes de tipo nos leitores), `652158e01` (domínio, casos de uso, rotas,
portal, catálogo e tipos), `411e5f652` (contrato de isolamento endurecido por mutação), `22a596012` (prettier) e o de
documentação desta seção. Sem push.

- **Cadeia da migration:** `git fetch` antes de gerar; fim da cadeia em `origin/staging` era
  `20261006144825_cargo_arrival_check_null_holes` (`d59e8b1f-…`). Gerada `20261006180700_cargo_arrival_receiving_occurrence`
  com `prevIds = ["d59e8b1f-…"]` (único filho), editada à mão: `SET LOCAL lock_timeout = '3s'` antes do primeiro
  `ALTER`, todo CHECK/FK novo `NOT VALID` + `VALIDATE`, `DEFAULT` no fim. `rollback.sql` **destrutivo** e com guarda
  (aborta com ocorrência de recebimento ou nota marcada; apaga os tipos `receiving`; `SET NOT NULL` por último).
  `bun run db:generate` → `{"status":"no_changes"}`. `make migration-test`: **126 → 130 pass / 0 fail** (aplica tudo,
  roda os rollbacks em ordem inversa, reaplica; +4 do contrato estático novo).
- **Contrato antes do código, vermelho pelo motivo certo:** schema (`6 fail`: colunas e CHECKs ausentes); política
  (`Cannot find module …/cargo-arrival-occurrence.policy.js`); caso de uso (`Cannot find module
…/cargo-arrival-return.use-case.js`); HTTP (`Cannot find module …/cargo-arrival-occurrence.routes.js`); leitura sem
  chave nova (`isSeparationOverdue` `true` com a nota marcada, 2 fail); proposta (`DOCUMENT_ALREADY_IN_ARRIVAL` no
  lugar de `DOCUMENT_RETURN_TO_CONTRACTOR`, 2 fail); catálogo de recebimento (`seedReceivingOccurrenceTypeCatalog`
  inexistente, 1 fail).
- **Achado durante a integração (corrigido antes do commit):** o nome do tipo é único por empresa **em qualquer
  etapa** (`company_occurrence_types_company_name_unique`, índice só na migration de 03/09). Semear "Item avariado" de
  recebimento derrubaria o pre-deploy com `23505` em toda empresa com o catálogo de viagem. Os três se chamam "… na
  chegada", o bootstrap pula nome usado e devolve quantos nasceram; integração prova o caso real (catálogo de viagem
  semeado antes, 14 + 6, depois 0 e 0).

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` e `bun run lint` (API): limpos. `bun run format:check` na raiz: limpo.
- Contrato (`bun --env-file=../../.env.test test --timeout 120000`): **antes 9779 pass / 25 skip / 0 fail** (199
  arquivos); **depois 9863 pass / 25 skip / 0 fail** (199 arquivos).
- Integração contra o Postgres do `.env.test` (65432, bancos descartáveis por teste), **arquivos passados um a um**:
  os 3 novos (`cargo-arrival-occurrence` 6, `cargo-arrival-return` 5, `cargo-arrival-occurrence-reach` 3) **mais**
  todas as suítes de chegada/prévia/perfil, ocorrência, tratativa, cobrança, correção, conversa, portal, lote do
  escritório e despacho automático (`cargo-*`, `contractor-portal*`, `contractor-receiving*`, `occurrence-*`,
  `trip-occurrence-*`, `stop-occurrence-photo`, `trip-detail-occurrence-marker`, `trip-redelivery-application`,
  `extra-charge-batch-statement`, `trip-field-office*`, `trip-auto-dispatch`): **antes 53 arquivos, 225 pass / 1 skip /
  0 fail; depois 56 arquivos, 239 pass / 1 skip / 0 fail** (o skip é o mesmo, anterior a esta task), rodados em
  duas metades de 28 arquivos (84 + 155). Uma rodada única anterior caiu em prazos de 30 s nas suítes da conversa
  (183) e de 120 s num anexo, com a máquina a carga média 46 por um Playwright de outra sessão: não é evidência, e a
  mesma suíte isolada passou em 6 s logo depois; as metades acima rodaram com a carga já em ~15.

### Mutações (script fora do repositório; cada arquivo restaurado; `git diff --quiet` limpo depois)

| Regra                            | Mutação                                          | Vermelho                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| janela                           | sem o teste de `separation_due_at`               | contrato 2 fail; integração 1 fail                                                                                                                                               |
| empresa na trava da chegada      | `where id = …` sem empresa                       | integração 1 fail (só depois de endurecer o teste: a 1ª rodada **sobreviveu** — a trava da nota recusava com outro código; o contrato passou a exigir `CARGO_ARRIVAL_NOT_FOUND`) |
| empresa na leitura               | `arrivalExists` sem empresa                      | integração 1 fail                                                                                                                                                                |
| exatamente um dono               | CHECK `= 1` → `>= 0` na migration                | estático 1 fail; integração 1 fail                                                                                                                                               |
| etapa ⇔ dono                     | CHECK trocado por `true`                         | integração 1 fail                                                                                                                                                                |
| sai da recomendação              | `findExcludedTripDraftDocumentIds` devolve vazio | integração 1 fail                                                                                                                                                                |
| `returned` terminal              | desfazer não recusa a devolvida                  | contrato 1 fail; integração 1 fail                                                                                                                                               |
| fechar: marcada segura           | sem o ramo `marked`                              | contrato 1 fail; integração 1 fail                                                                                                                                               |
| fechar: devolvida libera         | pendente sem olhar a marcação                    | contrato 3 fail; integração 1 fail                                                                                                                                               |
| desfazer é `occurrences.resolve` | política trocada por `trip.manage`               | contrato 2 fail; integração 1 fail                                                                                                                                               |
| reenvio antes da janela          | sem procurar a chave                             | contrato 2 fail; integração 1 fail                                                                                                                                               |
| item obrigatório                 | sem a recusa                                     | contrato 1 fail                                                                                                                                                                  |
| painel não lista o tipo          | sem o filtro de etapa                            | integração 1 fail                                                                                                                                                                |
| cadastro não converte            | `UPDATE` sem o filtro de etapa                   | integração 1 fail                                                                                                                                                                |
| portal pela nota da chegada      | `coalesce` só pela viagem                        | integração 1 fail                                                                                                                                                                |
| separar nota marcada             | sem a guarda do lote                             | contrato 1 fail; integração 1 fail                                                                                                                                               |
| motivo na proposta               | recusa vira aceite                               | contrato 2 fail; integração 1 fail                                                                                                                                               |
| leitura sem chave nova           | `returnToContractor` na nota                     | contrato 1 fail                                                                                                                                                                  |
| vencida ignora a marcada         | pendente = não separada                          | contrato 1 fail                                                                                                                                                                  |
| viagem viva não marca            | sem a recusa                                     | contrato 1 fail                                                                                                                                                                  |
| concluir espera a decisão        | sem a recusa                                     | contrato 3 fail; integração 1 fail                                                                                                                                               |
| nome próprio do catálogo         | "Item avariado" de volta                         | integração 1 fail                                                                                                                                                                |
| concorrência                     | sem as duas travas `for no key update`           | integração 1 fail                                                                                                                                                                |

### Decisões que divergiram do texto do pedido

1. **A leitura da chegada não ganhou `returnToContractor`/ocorrências/contagens** (ajuste 6 do architect): as guardas de
   chave exata do painel publicado derrubariam `/recebimento`. Tudo isso sai em `GET /cargo-arrivals/:id/occurrences`
   (`documents[].returnToContractor`, `occurrences[]`, `returnCounts`). Incorporar à leitura da chegada é um passo
   depois de o painel aceitar as chaves (T3.3).
2. **Desfazer a marcação é `occurrences.resolve`**, não `trip.manage` (ajuste 8); concluir é `trip.manage` mas exige a
   tratativa da origem `decided|closed`.
3. **Nomes do catálogo:** "Item avariado na chegada", "Divergência de quantidade na chegada", "Item faltante na chegada"
   (unique de nome entre etapas).
4. **Ocorrência só em nota `received|separated`** (R1) e **pelo menos um item** (ajuste 3); foto obrigatória com o teto
   do galpão (512 KiB), não 960 KiB.
5. **O feed `GET /trip-occurrences` e o detalhe do escritório não mostram a ocorrência de recebimento** (contrato deles
   exige viagem e placa); a tratativa é conduzida pelas seis ações existentes a partir do `caseId` da rota nova.
6. **Conversa (183) e e-mail da ocorrência de recebimento não foram estendidos**: o portal mostra a ocorrência sem
   conversa (sem 500 — provado na integração do portal).
7. **Concorrência da chave entre chegadas:** o `23505` de `idempotency_records` vira 409 no código, mas nenhum teste
   provoca a corrida entre duas chegadas (a de mesma chegada serializa na trava e é a provada).
8. **Arquivos de teste acima de 200 linhas** (três integrações e o contrato de caso de uso, 209–316): seguem o tamanho
   das suítes vizinhas do módulo; o código de `src/` novo ficou abaixo de 200 linhas por arquivo e 40 por função.

### Follow-ups (ADR-0094 §9.6)

Decisão do portal desfazer/concluir a marcação; conversa e e-mail da ocorrência de recebimento; correção/cancelamento e
foto adicional dela; cadastro de tipo `receiving` no painel; feed do escritório com ocorrência sem viagem; cobrança do
acerto sem viagem; travar o vínculo de nota marcada a uma viagem; rótulo "Recebimento" no `frontend-client`; medir
`trip_document_occurrences` antes de produção (`docs/SECURITY.md`).

### ⚠️ Para a T3.3 (tela)

Os tipos vêm de `GET /cargo-arrivals/occurrence-types`; a abertura é o multipart da 161 com `Idempotency-Key` de 16–256
caracteres `[A-Za-z0-9._:-]` (o mesmo da chegada); a marcação e as ocorrências vêm de `GET /cargo-arrivals/:id/occurrences`;
o painel só pode passar a ler chaves novas da leitura da chegada **depois** de aceitá-las como opcionais.

### Não rodou

Push e deploy (proibidos nesta rodada); a suíte de integração inteira da API (só os 56 arquivos acima); smoke e
`make check` completo; o painel e o `frontend-client` (fora do escopo); nenhuma leitura de staging nem de produção.

## T3.2b — itens da nota da chegada para a avaria (2026-10-06)

Commits: `0c7339576` (contrato vermelho) e `83ddb4ce7` (implementação); o de documentação desta seção. Sem push.

- **Lacuna:** o formulário de avaria (T3.3) precisa listar os itens da nota para o separador escolher os "itens
  afetados", e `POST …/occurrences` valida `productCodes[]` contra `nfe_products`. Nenhuma rota devolvia os itens de uma
  nota que só está em chegada (a da viagem junta `trip_documents`).
- **Rota:** `GET /cargo-arrivals/:id/documents/:documentId/products`, `fleet.read`, sem query. Arquivos:
  `presentation/cargo-arrival-document-products.routes.ts`, `application/read-cargo-arrival-document-products.use-case.ts`,
  `infrastructure/drizzle-cargo-arrival-document-products.repository.ts` (porta em `cargo-arrival-occurrence.port.ts`),
  montada em `cargo-arrival-occurrence.composition.ts` (que o `main.ts` já espalha — nada a mudar nele).
  Reusa o tipo `TripDocumentProduct` da rota da viagem; `listDocumentProducts` da transação da ocorrência ficou como
  está (devolve três campos, dentro da transação). Uma consulta só: `cargo_arrival_documents` (empresa + chegada + nota)
  com `left join nfe_products` por empresa e nota — sem linha é nota fora da chegada; `arrivalExists` distingue chegada
  alheia/inexistente.
- **Resposta:** `{ data: [{ code: string, commercialUnit: string, description: string, ordinal: number, quantity:
string, totalValue: string, unitValue: string }] }`, por `ordinal`; decimais em texto (`"10.0000"`), sem NCM nem CFOP.
  Nota sem item: `{ data: [] }`.
- **Erros:** 404 `CARGO_ARRIVAL_DOCUMENT_NOT_FOUND` (nota que não é da chegada, inclusive de outra chegada da mesma
  empresa); 404 `CARGO_ARRIVAL_NOT_FOUND` (chegada inexistente ou de outra empresa); 403 sem `fleet.read` (`trip.read`
  e `trip.manage` não bastam); 400 `INVALID_REQUEST` para query desconhecida. ⚠️ O pedido previa 400 para id malformado:
  o roteador (`canonicalUuid`) nem casa a rota e responde 404 `NOT_FOUND` — comportamento de todas as rotas, provado no
  contrato; o `parseUuidPathIdentifier` da rota é só defesa em profundidade.
- **Contrato antes do código, vermelho pelo motivo certo:** `Cannot find module …/read-cargo-arrival-document-products.use-case.js`
  e `…/cargo-arrival-document-products.routes.js` (`0 pass / 1 fail / 1 error`); `separator-role` 1 fail (a rota
  nova faltava na lista exaustiva). Nenhuma rota de OpenAPI/Scalar existe neste repositório hoje (busca por `openapi` em
  `src` e `test` vazia): o equivalente de "aparece no documento" é a lista exaustiva de `separator-role.contract.test.ts`,
  onde a rota entrou.

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` e `bun run lint` (API): limpos. `bun run format:check` na raiz: limpo.
- Contrato (`bun --env-file=../../.env.test test --timeout 120000`): **antes 9863 pass / 25 skip / 0 fail** (199
  arquivos; número da T3.2); **depois 9871 pass / 25 skip / 0 fail** (199 arquivos; +4 do caso de uso, +4 do HTTP).
- Integração contra o Postgres do `.env.test` (65432, bancos descartáveis por teste), um arquivo por vez:
  `cargo-arrival-document-products` **5 pass / 0 fail** (nova); `cargo-arrival-occurrence` 6, `cargo-arrival-occurrence-reach`
  3, `cargo-arrival-return` 5, todas 0 fail. Nenhum arquivo pulado.

### Mutações (cada arquivo restaurado por `git checkout --`; `git diff --quiet` limpo depois)

| Regra                      | Mutação                                                  | Vermelho                                             |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| empresa na consulta        | `buildArrivalDocumentFilters` trocado por só `arrivalId` | integração 1 fail (chegada de outra empresa 200)     |
| a nota pertence à chegada  | filtro trocado por só `companyId`                        | integração 2 fail (nota cruzada e chegada solta)     |
| só campos de conferência   | `ncm` e `cfop` no `select`                               | integração 1 fail (conjunto exato de chaves)         |
| ordem do XML               | `orderBy(desc(ordinal))`                                 | integração 1 fail                                    |
| `fleet.read`               | política trocada por `trip.manage`                       | contrato HTTP 3 fail                                 |
| sem query                  | `readListQuery` removido                                 | contrato HTTP 1 fail                                 |
| chegada alheia ≠ nota fora | sempre `document-not-found`                              | integração 1 fail (código `CARGO_ARRIVAL_NOT_FOUND`) |

### Não rodou

Push e deploy (proibidos nesta rodada); a suíte de integração inteira da API (só a nova e as três de ocorrência/devolução
da chegada); `make check` completo, `make migration-test` (sem schema nem migration) e `db:generate` (idem); smoke; o
painel (T3.3 é do executor do painel); nenhuma leitura de staging nem de produção.

## T3.3 — a avaria na entrada e "devolver ao contratante" no painel (2026-10-06)

Commits: `9185335f8` (contrato vermelho), `0ac7ec739` (implementação), o do teste de invalidação, e o desta seção (prints, evidência,
docs). **Sem push** (tela nova: só depois do "pode publicar"). Nada mudou na API; o painel a consome em staging
(`101ecb3e6..0e31a602b`).

- **O que foi construído** (módulo `cargo-receiving`; detalhe em `docs/ai-context/frontend-transportada.md` § "Spec 237 T3.3"):
  celular do separador — botão **Avaria** por nota (recebida/separada), formulário em tela cheia (tipo, itens com contagem e unidade,
  observação, foto reduzida no aparelho, `Idempotency-Key` por tentativa), selos "Avaria aberta/A devolver/Devolvida", "Devolver ao
  contratante" (avaria de origem + observação), "Concluir devolução" e "Desfazer devolução" (só `occurrences.resolve`); detalhe do
  escritório — coluna "Avaria e devolução", contagens, lista das avarias, "Fechar chegada" travado com o motivo e a lista; prévia —
  texto próprio para `DOCUMENT_RETURN_TO_CONTRACTOR` na lista "notas que ficam de fora".
- **Contrato antes do código, vermelho pelo motivo certo** (`9185335f8`): 7 arquivos puros + 3 de DOM + harness, todos com `Cannot find
module …/cargoOccurrence*` (cliente, validação, formulário, máquina da nota, textos). ⚠️ `occurrence-trip-draft.contract.ts` já
  passava (cobre o comportamento que a API já tem; a prova dele é a mutação 14).
- **Chaves exatas:** `cargoOccurrenceGuards.validation.ts` confere as chaves do formato REAL (tipos, itens, anexo, ocorrência, marcação,
  contagens, resultado); o anexo aceita as três opcionais da API (`downloadUrl`, `expiresAt`, `thumbnailUrl`) e nada além.

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` e `bun run lint` (painel): limpos; lint **0 erros** (16 avisos antigos, os mesmos de antes). `bun run format:check` na
  raiz: limpo.
- `bun run test` (painel), referência do pedido ~6985 / 662: **7057 pass / 0 fail** (processo dos contratos) e **716 pass / 0 fail**
  (`test:hooks`, 54 contratos de DOM novos). Dois contratos antigos mudaram de propósito (`cargo-arrival-detail`: a tabela ganhou a quarta
  coluna) e `modal-dialog-fullscreen` registrou o diálogo novo.
- **Estabilidade do DOM:** `bun run test:hooks` **10 execuções limpas, todas 716 pass / 0 fail**, e **3 com a CPU ocupada** (11 processos
  `yes`, um por núcleo): 3 de 3 verdes. Os três arquivos de DOM rodam também **isolados** (22, 17 e 14 pass). Sem `expect(nó).toBeNull()` dentro
  de `waitFor` (ausência é `querySelectorAll(...).length`). Achado: o `Select` só abria dentro da suíte completa (o `getBoundingClientRect`
  zerado do happy-dom o fecha na hora, e outra suíte instalava o remendo) — o contrato dependia da ordem; agora `stubVisibleLayout()` é
  instalado por cada arquivo.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout --`; `git diff --quiet` limpo depois)

| #   | Regra                                  | Mutação                                                                                                                                       | Vermelho (contrato puro / DOM)                   |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | desfazer só com `occurrences.resolve`  | `canUnmark` usa `canManage`                                                                                                                   | 1 / 2                                            |
| 2   | a janela vale para abrir               | `isOccurrenceWindowOpen` devolve `true`                                                                                                       | 2 / 1                                            |
| 3   | idempotência por tentativa             | `previous: undefined` (chave nova a cada envio)                                                                                               | 0 / 2                                            |
| 4   | fechar trava com nota marcada          | botão sem `blockers.length > 0`                                                                                                               | 0 / 2                                            |
| 5   | devolvida é terminal                   | `isEditable` ignora `returned`                                                                                                                | 2 / 1                                            |
| 6   | erro nunca mudo                        | `catch` não grava o código                                                                                                                    | 0 / 3                                            |
| 7   | cartão com rótulo por célula           | sem `data-label` na coluna nova                                                                                                               | 0 / 3                                            |
| 8   | foto até 512 KiB                       | a checagem de tamanho vira `false`                                                                                                            | 1 / 1                                            |
| 9   | item obrigatório                       | `itemsRequired` removido                                                                                                                      | 1 / 1                                            |
| 10  | recusa nomeia cada campo uma vez       | sem `Set`                                                                                                                                     | 2 / 1                                            |
| 11  | chave de idempotência vai ao servidor  | cliente sem `idempotencyKey`                                                                                                                  | 1 / 0                                            |
| 12  | "Separar tudo" não leva a nota marcada | `separable = group.documents`                                                                                                                 | 0 / 1                                            |
| 13  | resposta de chaves exatas              | tipo aceita chave a mais (1ª tentativa **sobreviveu**: a chave da mutação era `extra` e o teste usava `active`; mutação refeita com `active`) | 1 / 0                                            |
| 14  | recomendação não oferece nota marcada  | criação de viagem leva todas as notas do rascunho                                                                                             | 3 / 1                                            |
| 15  | a devolução relê as prévias            | sem a invalidação das prévias                                                                                                                 | 0 / 1                                            |
| 16  | nota marcada não tem passo de separar  | passo oferecido de novo                                                                                                                       | 0 / 2                                            |
| 17  | concluir espera a tratativa            | `isCaseDecided` sempre `true`                                                                                                                 | 1 / 2                                            |
| 18  | nota em viagem viva não marca          | sem `!isInLiveTrip`                                                                                                                           | 1 / 1                                            |
| G   | **coluna cortada** (geometria real)    | `.colReturn { width: 60rem }`                                                                                                                 | Playwright: `expectNoClipping` vermelho a 768 px |

### Revisão de design (prints, `getComputedStyle`, geometria)

36 PNGs em `specs/237-.../prints/` (`avaria-{formulario,nota-com-avaria,devolver,a-devolver,detalhe-escritorio,janela-vencida}-{375,768,1280}-{dark,light}.png`),
gerados por `test/spec-237-avaria-prints.smoke.spec.ts` (fora da CI): build com `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária, `vite preview`
na porta 53321, config do Playwright descartável apagada, API 100% dublada, dados e foto sintéticos. 38 testes, todos verdes.

- **Geometria real:** `expectNoClipping` (main) em **todos** os 3 larguras, o diálogo sem elemento além da borda dele e sem rolagem lateral,
  nenhuma célula invadindo a vizinha, rolagem horizontal da página ≤ 0. ⚠️ A primeira passada visual achou dois defeitos que o teste não
  pegava: a 768 px a coluna nova (18 rem) fazia "Destinatário" e "Situação" se sobreporem (larguras agora 7/8/14 rem; o teste ganhou a conferência
  de sobreposição) e o "." do aviso de fechamento caía numa linha própria (`display: grid` no parágrafo). Também saiu o teto de altura da lista de itens
  (cortava o 3º item dentro do diálogo).
- **Vizinhos (375, escuro):** "Avaria" e "Devolver ao contratante" medem **44 px**, Arial 13,33 px, borda 1 px — idênticos ao "Marcar como
  separada" da mesma linha. No formulário, quantidade, unidade (`Select`) e tipo (`Select`) medem **48 px**, mesma fonte e tamanho; a observação 64 px.
- **Contraste (WCAG, nos dois temas, todos os selos, avisos, botões, rótulos e erros medidos):** mínimo **4,87:1 no escuro** e **4,83:1 no claro**
  (limite do teste 4,5).
- **Alvo de toque a 375 px:** lista vazia de problemas em todas as telas e nos dois temas (todo botão da nota e do diálogo ≥ 44 px).
- Olhado nos PNGs: formulário 375 escuro, nota "a devolver" 375 escuro, detalhe 768 claro/escuro e 375 escuro (cartões). Pendência de design
  registrada, não consertada: a nota "A devolver" ainda oferece "Avaria" (a API aceita outra avaria em nota marcada).

### Decisões que divergiram do texto do pedido

1. **Sem link para a tratativa.** O detalhe `/ocorrencias/:id` e o feed exigem viagem (ADR-0094 §9.1/§9.6): linkar levaria a "não encontrada". A
   lista mostra só a situação (`occurrence.case.*`). **Consequência real:** o escritório ainda não consegue conduzir a tratativa da avaria de
   recebimento pelo painel (as seis ações de `/trip-occurrences/:id/case/*` existem na API, mas não há tela) — concluir a devolução depende de
   o contratante decidir pelo portal. Follow-up.
2. **Janela vencida:** aviso neutro UMA vez no topo da tela (`data-window-closed`) + linha curta "Prazo de avaria encerrado." em cada nota; nada de
   botão desabilitado.
3. **"Fechar chegada" fica desabilitado** com a nota marcada (o pedido dizia só "mostrar o motivo"): botão vivo que a API recusa seria o botão morto
   que o módulo evita.
4. **`allowsMultipleItems = false`** troca o item marcado em vez de recusar o segundo; `itemsMode = off` esconde os itens e não os exige.
5. **Fingerprint da chave inclui a ordem dos itens** (o servidor imprime a lista na ordem enviada; mesma chave com outra ordem seria 409).
6. **Só o celular abre a avaria**; o escritório marca/desfaz/conclui (como o pedido listava).
7. **Funções/arquivos:** nenhum arquivo novo passa de 200 linhas; ficaram 5 componentes JSX-densos entre 47 e 56 linhas (o módulo já tem vizinhos de 60–80).
8. Teste de foto: `cargoOccurrencePhoto.service.ts` embrulha `buildOccurrencePhotoAttachment` (serviço puro de `trip/shared`; nenhum componente nem hook do
   `trip` foi importado) para o happy-dom, que não tem canvas.

### Follow-ups

Tratativa da avaria de recebimento no painel (ações do escritório); fila offline do toque e da avaria (a rede que cai fica na tela com "tentar de
novo"); o portal do contratante ainda mostra a etapa `receiving` crua; esconder "Avaria" na nota já marcada se o produto preferir.

### Não rodou

Push/deploy; `make check` completo, `make smoke`/smoke da CI, `make migration-test` (nada de schema); a API (nada mudou) e suas suítes; teste em
aparelho/câmera reais (a câmera é o `capture="environment"` do `FileField`); leitura de staging ou produção. Observação: um `pkill -f "vite preview"`
ao encerrar os prints pode ter derrubado um preview de OUTRA sessão que estivesse rodando na máquina.

## T3.4a — correções da revisão `opus` da Fase 3, lado API (2026-10-06)

Commits (todos em `apps/api-transportada`, **sem push**): `4d967ceea` (contrato e integração vermelhos da devolução e da tratativa),
`f1a473eb6` (política da devolução + acerto sem cobrança), `4ac9cb226` (erros tipados), `0785dce93` (foto antes da trava),
`1849be0b9`/`94ea6329d`/`c267231d8` (foto que não assina), `aaf1dfbf9`/`81e3a1c74` (nome do tipo), `2fa457f9c`/`479932115` (aviso da
semente), `e88e41ad9` (teto de requisições), `742f2f8f2` (tipo do contrato de tetos). O painel não foi tocado.

### A verificação obrigatória — o mapa das seis ações sobre a ocorrência de RECEBIMENTO

Prova: `test/integration/cargo-arrival-occurrence-case.integration.ts` (3 testes, na lista explícita do `package.json`), contra Postgres,
tudo por HTTP — uma ocorrência com `cargo_arrival_document_id`, sem `trip_document_id`, aberta pela rota real, conduzida pelas rotas reais
de `/trip-occurrences/:id/case/*`. Nenhum `UPDATE` direto.

| Ação (`POST /trip-occurrences/:id/case/…`) | Funciona?                      | Efeito observado                                                                                                          |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `review`                                   | sim, sem mudança               | `recorded → under_review`                                                                                                 |
| `contractor-submission`                    | sim, sem mudança               | `under_review → awaiting_contractor` (a avaria nasce com item, então a política `blocked` aceita)                         |
| `decision` (escritório decide por ele)     | sim, sem mudança               | `awaiting_contractor → decided` com `kind: 'other'` ou `goods_paid`; `redelivery_authorized` é 422 (política `blocked`)   |
| `closure`                                  | **não, para `goods_paid`**     | `decided → closed` com `other` funciona; com `goods_paid` é 422 `OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS` e **não saía** |
| `warehouse-return`                         | sim, sem mudança               | `under_review → returned_to_warehouse` (nota obrigatória)                                                                 |
| `cancel`                                   | sim, sem mudança               | `recorded → cancelled` (nota obrigatória)                                                                                 |
| `return-complete` (da devolução)           | sim                            | depois de `decided`, `marked → returned`; agora também recusa viagem viva, tratativa cancelada e ausente                  |
| `PUT …/case/settlement` (o acerto)         | **não funcionava → corrigido** | 422 `DELIVERY_CLIENT_NOT_RESOLVED` para qualquer item                                                                     |

- **A causa do acerto:** `DrizzleOccurrenceSettlementChargeRepository.applyOccurrenceSettlementCharge` (a ponte acerto → cobrança, 164 T17)
  lançava `OccurrenceChargePartiesUnresolvedError` quando `trip_document_id` era nulo — e o `PUT` do acerto chama a ponte para **todo**
  item. Sem acerto, `closure` com decisão `goods_paid` é recusado, e a decisão `goods_paid` (a de avaria que interessa: "a transportadora
  paga") **nunca fechava**. O texto do ADR §9.6 ("o acerto por item funciona, então `goods_paid` fecha, sem cobrança") descrevia o que o
  código **não** fazia. Provado vermelho (`422 DELIVERY_CLIENT_NOT_RESOLVED`) antes da correção.
- **A correção (menor lugar):** `DrizzleOccurrenceSettlementRepository.lockWritableCase` passou a devolver `hasTrip` (a mesma linha de
  ocorrência que já lia, mais `trip_document_id`), e `recordSettlement` só chama a ponte quando a ocorrência tem viagem. Ocorrência de
  viagem: caminho idêntico (as integrações `trip-occurrence-settlement`, `occurrence-settlement-charge-bridge`, `occurrence-charge` e
  `occurrence-charge-report` continuam verdes). Ocorrência de recebimento: o acerto é gravado **sem cobrança**.
- ⚠️ **Decisão de produto embutida:** o acerto de avaria de recebimento fica sem linha em `delivery_charges` (não há viagem nem cliente de
  entrega a quem cobrar). A cobrança do acerto da ocorrência sem viagem segue follow-up (ADR §9.6). Se a transportadora precisar cobrar o
  contratante por avaria de recebimento, isso é spec nova.
- **Não testado por integração nesta task:** `reimbursement` do acerto, `redelivery-proposal`/`redelivery-application` (a política `blocked`
  nunca oferece reentrega) e o detalhe/feed `GET /trip-occurrences…` (exigem viagem — ADR §9.1; por leitura do código, não por teste).

### Os nove achados

| #   | Achado                                                   | Contrato/integração vermelho (motivo)                                                                                 | Correção                                                                                                                                                                                      |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | concluir não conferia nota em viagem viva                | `decideComplete` devolvia `changed`; integração: a nota vinculada a viagem concluía (200)                             | `decideComplete` recusa `isInLiveTrip` com `CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP`                                                                                                              |
| 2   | upload da foto sob a trava da chegada                    | contrato: `upload` depois de `lock-arrival`; integração: `for no key update nowait` na chegada falha durante o upload | reenvio já gravado lido fora da trava; foto sobe antes da transação, com o id da ocorrência gerado antes; dentro, só chave e linhas; foto apagada no reenvio da corrida, na recusa e na falha |
| 3   | `Promise.all` derrubava a marcação por foto              | integração: assinatura falhando dava 500 na lista                                                                     | `readAttachmentsSafely`: `try/catch` por ocorrência, `[]` e log `cargo_arrival_occurrence.attachments_unavailable` (`errorName` + id)                                                         |
| 4   | marcar aceitava origem com tratativa `cancelled`         | contrato e integração: marcar e concluir com a tratativa cancelada davam `changed`/200                                | `CARGO_ARRIVAL_RETURN_CASE_CANCELLED` (409, mensagem própria) em marcar e em concluir; o caso de uso agora lê a tratativa também ao marcar                                                    |
| 5   | concluir aceito sem tratativa                            | contrato e integração (tipo `unset`): concluía sem tratativa                                                          | `caseStatus === null` recusa com `CARGO_ARRIVAL_RETURN_DECISION_PENDING` — **divergência do texto fechada a favor do ADR §9.5 ajuste 8**                                                      |
| 6   | nome do tipo colidindo com tipo de recebimento escondido | integração: o `PUT`/criar e renomear davam o erro cru do Postgres (500)                                               | `OCCURRENCE_TYPE_NAME_TAKEN` (409), criar e renomear (`rethrowOccurrenceTypeViolation`)                                                                                                       |
| 7   | `new Error` cru                                          | contrato e integração: o erro não era `DiagnosableError`                                                              | `CargoArrivalOccurrence{NotReadBack,ReplayUnreadable,NotSaved}Error` (`DiagnosableError`); 500 genérico ao cliente                                                                            |
| 8   | semente que grava 0 tipos em silêncio                    | contrato: nenhum aviso quando nada é gravado                                                                          | `occurrence_type_seed.receiving_none_created` (`warn`, `{ companyId }`), no stderr do pre-deploy em JSON                                                                                      |
| 9   | sem `rateLimit` em marcar/desfazer/concluir              | contrato `rate-limited-routes`: as três rotas sem teto                                                                | balde `cargo-arrival-return`, 120/300 s, Postgres (as transições do escritório da tratativa usam o mesmo teto)                                                                                |

- **N+1 de anexos (achado 3, segunda metade): não feito.** Uma consulta de anexos por ocorrência (e, sem anexo, a consulta da coluna
  antiga) mora em `DrizzleOccurrenceAttachmentRepository.listOccurrenceAttachments`, repositório compartilhado com a viagem; agrupar exige
  um método novo ali. Follow-up registrado (a lista da chegada é pequena e a foto agora não derruba nada).
- **Achado 5 / nulo:** `caseStatus === null` só ocorre com tipo `unset`; os três tipos semeados são `blocked`, então o caminho é inalcançável pelo
  painel. Marcar com uma ocorrência sem tratativa continua aceito (e a nota só volta pelo "desfazer").
- **Achado 2 / o que NÃO mudou do §9.5 ajuste 4:** ordem trava → chave → reenvio, reenvio devolve o mesmo resultado com a chegada fechada ou a
  janela vencida, `23505` de `idempotency_records` = 409. A consulta de fora é só um atalho barato: sem ela e sem a releitura dentro da trava,
  nada se perderia, só a foto subiria de novo. O preço aceito: recusa depois do upload (janela vencida, nota errada) sobe e apaga ≤ 512 KiB +
  miniatura; a rota tem teto de requisições.

### Gates (rodados nesta sessão)

- `bun run typecheck`: limpo. `bun run lint` (API): **0 erros, 0 avisos** (`--max-warnings=0`).
- Contratos da API (`bun --env-file=../../.env.test test --timeout 120000`): **9882 pass / 25 skip / 0 fail** (antes: 9871 / 25 / 0; +11).
- Integrações (um arquivo por vez, banco `65432`): `cargo-arrival` 6, `…-null-checks` 3, `…-concurrency` 3, `…-list` 1, `…-clock` 1,
  `…-occurrence` 6, `…-return` 8 (era 5), `…-occurrence-reach` 3, `…-occurrence-case` 3 (nova), `…-occurrence-upload` 5 (nova),
  `…-occurrence-read` 1 (nova), `…-document-products` 5, `occurrence-type-name-taken` 2 (nova), `occurrence-type-items-mode` 5,
  `…-redelivery-policy` 2, `…-leaves-document-behind` 4, `…-catalog-seed` 2, `trip-occurrence-case` 4, `…-case-write-guard` 3,
  `occurrence-case-closure` 1, `trip-occurrence-settlement` 7, `occurrence-settlement-charge-bridge`, `occurrence-charge`,
  `occurrence-charge-report` — todas 0 fail, nenhuma pulada.
- `bun run format:check` na raiz: limpo.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout --`; `git diff --quiet` limpo depois)

| #   | Regra                                      | Mutação                                                                                                                                              | Vermelho                                                         |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| M1  | concluir recusa viagem viva                | sem a checagem em `decideComplete`                                                                                                                   | contrato 2 + integração 1                                        |
| M2  | tratativa cancelada recusa marcar/concluir | sem as duas checagens                                                                                                                                | contrato 3 + integração 1                                        |
| M3  | concluir exige tratativa decidida          | `caseStatus !== null &&` (de volta ao texto antigo)                                                                                                  | contrato 1 + integração 1                                        |
| M4  | acerto sem viagem não cobra                | `if (true)` no lugar de `if (locked.hasTrip)`                                                                                                        | integração da tratativa 1 (o 422 `DELIVERY_CLIENT_NOT_RESOLVED`) |
| M5a | foto da corrida do reenvio é apagada       | sem `discardUploadedPhoto`                                                                                                                           | contrato 1 + integração 1 (objeto órfão)                         |
| M5b | reenvio já gravado nem sobe a foto         | sem a consulta de fora da trava                                                                                                                      | contrato 2 + integração 1                                        |
| M5c | a foto sobe antes da trava                 | `lockArrival()` antes do upload, dentro da transação (a 1ª versão da mutação subia dentro da transação mas antes da trava e **sobreviveu**; refeita) | integração 2                                                     |
| M6  | foto não derruba a leitura                 | o `catch` relança                                                                                                                                    | integração 1                                                     |
| M7  | nome colidindo é 409                       | o ramo do índice único desligado                                                                                                                     | integração 2                                                     |
| M8  | erro tipado                                | `new Error` cru nos dois lugares                                                                                                                     | contrato 1 + integração 1                                        |
| M9  | aviso da semente                           | sem `onNoneCreated`                                                                                                                                  | contrato 1                                                       |
| M10 | teto nas três rotas da devolução           | sem `rateLimit`                                                                                                                                      | contrato 1                                                       |

### Não rodou

Push/deploy; `make check` completo; `make migration-test`/`db:generate` (nada de schema nem migration); a integração inteira da API (só as listadas);
o painel e o `frontend-client` (nada mudou); `reimbursement`, `redelivery-*` e o feed `GET /trip-occurrences` sobre ocorrência de recebimento;
leitura de staging ou de produção.

## T3.4b — o painel conduz a tratativa da avaria de recebimento e as correções da revisão (2026-10-06)

Commits (só `apps/frontend-transportada`, docs e prints; **sem push**, API intocada): `f24b56503` (contrato vermelho), `fdd458c34`
(implementação) e o desta seção (prints, evidência, docs). Detalhe técnico: `docs/ai-context/frontend-transportada.md` § "Spec 237 T3.4b".

### O que foi construído

- **Tratativa no detalhe do escritório** (`CargoOccurrenceCaseActions`, só com `occurrences.resolve`): Iniciar análise (direto) · Enviar ao
  contratante, Registrar decisão, Encerrar tratativa, Devolver ao galpão, Cancelar tratativa (painel com confirmação, motivo obrigatório onde
  a API exige, foco no campo). Cada estado oferece EXATAMENTE o que a máquina da API aceita (`resolveCargoCaseActions`), com todos os botões
  da avaria travados enquanto uma ação está em voo; a avaria é relida (detalhe, lista, prévias) também quando a ação falha.
- **Acerto `goods_paid`** (versão enxuta em `cargo-receiving`, sem motorista nem ressarcimento): abre ao decidir `goods_paid` aqui ou quando
  "Encerrar" é recusado com 422; `PUT` sem `payerId`, `amountSource: 'manual'`.
- **Correções da revisão:** origem cancelada (esconde do "Devolver", aviso "Tratativa cancelada — desfaça a devolução", sem "Concluir"),
  `src` estável da miniatura, tipos vazios, progresso com notas devolvidas, corrida de fotos, rótulos dos 409 novos, do 429 e de
  `OCCURRENCE_TYPE_NAME_TAKEN` (cadastro de tipos).

### Contrato antes do código

`f24b56503`: 6 arquivos puros + 7 de DOM + 2 harness/helper; os puros caem em `Cannot find module …` e os de DOM em `CASE_BUTTON_NOT_FOUND` /
asserções (a funcionalidade não existia). Corpo exato das ações verificado contra `occurrence-case.schema.ts`, `occurrence-settlement.schema.ts` e
a integração `cargo-arrival-occurrence-case.integration.ts` — o corpo era o descrito, nenhuma ação falhou.

### Gates (rodados nesta sessão, em primeiro plano)

- `bun run typecheck` limpo; `bun run lint` **0 erros** (16 avisos antigos); `bun run format:check` na raiz limpo.
- `bun run test` (painel): **7122 pass / 0 fail** (antes 7057; +65) e `test:hooks`: **773 pass / 0 fail** (antes 716; +57 contratos de DOM).
- **Estabilidade do DOM:** `bun run test:hooks` **10 execuções limpas (773/0) e 3 com CPU ocupada (11 `yes`, um por núcleo, mortos pelo PID depois):
  3 de 3 verdes**; os 7 arquivos novos de DOM passam também isolados (24, 10, 6, 2, 7, 4 e 4). Todos instalam `stubVisibleLayout()`; nenhum
  `expect(nó).toBeNull()` dentro de `waitFor`. ⚠️ Achado: `beforeEach` de nível de arquivo vale para o processo inteiro (as suítes de DOM são
  importadas juntas) — o dublê da tratativa vira função (`currentCaseDouble()`), e o `mock.module` do cliente novo mora no harness antigo,
  que carrega antes de qualquer fonte.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout --`; `git diff --quiet` limpo depois de cada uma)

| #   | Regra                                             | Mutação                                      | Vermelho (puro / DOM) |
| --- | ------------------------------------------------- | -------------------------------------------- | --------------------- |
| M1  | ação só com `occurrences.resolve`                 | `canReview` sem `canResolve`                 | 1 / 1                 |
| M2  | reentrega nunca oferecida                         | `redelivery_authorized` na lista de decisões | 1 / 1                 |
| M3  | nota obrigatória                                  | `isCaseNoteRequired` devolve `false`         | 1 / 7                 |
| M4a | acerto abre quando o servidor recusa (422)        | ramo `settlementWithoutItems` desligado      | 0 / 7                 |
| M4b | acerto abre ao decidir `goods_paid`               | `setSettlementRequired` removido             | 0 / 2                 |
| M5a | `src` estável entre leituras                      | sem `structuralSharing`                      | 0 / 3                 |
| M5b | `src` troca quando a assinatura é nova            | `isStillSafe` sempre `false`                 | 1 / 3                 |
| M5c | `src` troca perto de vencer                       | `isStillSafe` sempre `true`                  | 1 / 1                 |
| M6  | origem cancelada não é motivo                     | filtro só por `cancelledAt`                  | 2 / 2                 |
| M7  | corrida de fotos                                  | sem a guarda da escolha corrente             | 0 / 2                 |
| M8  | invalidação                                       | sem `onSettled`                              | 0 / 13                |
| M8b | invalidação também na falha                       | `onSuccess` no lugar de `onSettled`          | 0 / 1                 |
| M9  | erro nunca mudo                                   | `CargoCaseFailure` não renderizado           | 0 / 7                 |
| M10 | aviso da origem cancelada                         | `isReturnCaseCancelled` sempre `false`       | 1 / 2                 |
| M11 | progresso sem as devolvidas                       | notas devolvidas contam no total             | 4 / 2                 |
| M12 | tipos vazios explicados                           | `hasNoTypes` sempre `false`                  | 0 / 1                 |
| M13 | item repetido no acerto                           | ramo `productCodeDuplicated` removido        | 1 / 0                 |
| M14 | uma ação por vez                                  | botões não travam em voo                     | 0 / 1                 |
| M15 | rascunho do acerto trava "Encerrar"               | `isBlocked` sempre `false`                   | 0 / 1                 |
| M16 | permissão no container                            | `canResolve: true` fixo                      | 0 / 1                 |
| M17 | sem tratativa não conclui                         | `case === null` volta a decidir              | 1 / 0                 |
| M18 | caminho certo do encerramento                     | `closure` → `close`                          | 1 / 0                 |
| M19 | motorista não é pagador                           | `driver` na lista de pagadores               | 2 / 0                 |
| M20 | confirmar só com o motivo                         | confirmar sem `isNoteMissing`                | 0 / 3                 |
| M21 | nota com `trim`                                   | sem `trim`                                   | 0 / 2                 |
| M22 | tratativa cancelada (status) conta como cancelada | só `cancelledAt`                             | 3 / 4                 |

As 25 mutações reprovaram ao menos um contrato.

### Revisão de design (prints, `getComputedStyle`, geometria)

42 PNGs em `specs/237-.../prints/` (`tratativa-recebimento-{analise,decisao,acerto,concluir,cancelada}`, `avaria-tipos-vazio`,
`avaria-progresso-completo`, cada um em 375/768/1280, escuro e claro), gerados por `test/spec-237-tratativa-prints.smoke.spec.ts` (+
`spec-237-prints-smoke.helper.ts`, também usado agora pelo spec da T3.3): build com `VITE_SMOKE_AUTH_BYPASS=true` e `VITE_API_URL` na origem do
preview (mesma origem, sem CORS), `vite preview` na porta 53421, config do Playwright descartável e build apagados, API 100% dublada, dados e
foto sintéticos. 44 testes verdes.

- **Geometria real:** `expectNoClipping` (main) em todos os 3 larguras, diálogo sem elemento além da borda, nenhuma célula invadindo a vizinha,
  rolagem horizontal ≤ 0.
- **Vizinhos (375, escuro):** "Encerrar tratativa" mede **44 px**, Arial 13,33 px, borda 1 px — idêntico a "Concluir devolução" da mesma
  linha; no acerto, item (`Select`), valor (campo) e pagador (`Select`) medem **48 px**, mesma fonte (14,4 px). Um rótulo ("Valor") saiu maior
  que os vizinhos na primeira passada visual: corrigido (`.settlementRow label` a 0,85 rem) e os prints refeitos.
- **Contraste (WCAG, todos os selos, botões, avisos, rótulos, campo, total e progresso medidos):** mínimo **4,87:1 no escuro** e **4,83:1 no
  claro** (limite 4,5).
- **Alvo de toque a 375 px:** lista vazia de problemas nas telas novas e nos dois temas (todo botão ≥ 44 px).
- Olhado nos PNGs: análise 375 escuro, acerto 375 escuro, decisão 768 claro, tipos vazio 375 escuro e progresso 375 escuro. Pendência de
  design registrada, não consertada: com o painel de decisão aberto o botão "Registrar decisão" que o abriu continua à vista (o painel tem o
  mesmo título e o mesmo botão de confirmar).
- A execução de sanidade do spec da T3.3 refatorado (`avaria-devolver` 375 escuro + as duas revisões de vizinhos) passou 8 de 8 e o PNG tocado
  foi restaurado (`git checkout`).

### Decisões que divergiram do texto do pedido

1. **"Devolver ao galpão" só em `under_review`, "Cancelar" em `recorded|under_review`** (o pedido dizia "qualquer estado aberto"): a API recusa
   o resto com 409; botão que sempre falha é botão morto (mesmo critério da 164). Divergência verificada em `occurrence-case-state.policy.ts`.
2. **A leitura das avarias não traz a decisão** (`case {id,status}`): "se `goods_paid`, o formulário do acerto antes" é reativo — abre ao decidir
   `goods_paid` na própria tela e quando o 422 do encerramento chega (decidido pelo contratante no portal). Follow-up de API: expor `decision`
   em `case`.
3. **Formulário do acerto escrito em `cargo-receiving`**, não reaproveitado: o `OccurrenceSettlementPanel` do `trip` (418 linhas) traz motorista
   (`payerId`, `fleet`) e ressarcimento, que sobre recebimento não foi exercitado. Reaproveitado só o serviço puro de dinheiro
   (`occurrenceSettlementMoney.service`, de `trip/shared`, como a foto da T3.3); pagadores: transportadora, contratante, seguradora.
4. **Ações da tratativa não dependem do estado da chegada** (a chegada fechada continua oferecendo-as): o contratante decide dias depois do
   fechamento; só as ações da NOTA (marcar/concluir) seguem presas à chegada aberta.
5. **`case: null` deixou de concluir a devolução** (um contrato da T3.3 dizia o contrário): a API recusa desde a T3.4a (`CARGO_ARRIVAL_RETURN_DECISION_PENDING`).
6. **Textos de erro compartilhados** entre marcar e concluir: `CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP` e `CARGO_ARRIVAL_RETURN_DECISION_PENDING`
   foram reescritos para valer nos dois casos (a chave é a mesma).
7. **Guarda da resposta das ações:** chaves exatas (`kind`, `status`) como o resto do painel — a resposta real é `{ kind, status }`, não a visão
   completa da tratativa.
8. `useCargoOccurrencesQuery` ganhou `structuralSharing` próprio em vez de `select`: só ele vê a leitura anterior.

### Follow-ups

- ⚠️ **Suspeita no módulo `trip` (não tocado):** `tripOccurrenceFeedClient.readCaseView` exige a visão completa da tratativa
  (`redeliveryPolicy`, `updatedAt`…) e as rotas das ações respondem só `{ kind, status }` (`occurrence-case.use-case.ts`); se confirmado, o painel de
  tratativa da viagem lê o sucesso como `RESPONSE_INVALID` e não invalida o feed. Sem teste de cliente para essas rotas no painel.
- API: expor `decision` em `case` de `GET /cargo-arrivals/:id/occurrences`; N+1 de anexos (T3.4a).
- Esconder o botão que abriu o painel enquanto o painel está aberto; fila offline das ações; reembolso do acerto sobre recebimento.

### Não rodou

Push/deploy; rebase (staging andou 53 commits); `make check` completo, `make smoke`/smoke da CI, `make migration-test` (nada de schema); a API e suas
suítes (nada mudou); o `frontend-client`; teste em aparelho/câmera reais; leitura de staging ou produção.

## T4.6 — a prévia por e-mail encaminhado (2026-10-07)

### O que foi construído

- **Migration `20261007040900_cargo_preview_email_intake`** (aprovada pelo usuário no chat — "Sim, pode criar"),
  aditiva, com `rollback.sql` e `snapshot.json` encadeado ao último de staging: três colunas nulas em
  `contractor_receiving_profiles` (`preview_inbound_token_hash`, `preview_forwarder_allowlist`,
  `preview_sender_allowlist`, CHECK de que o token exige as duas listas e índice único parcial do hash por empresa),
  `cargo_previews.source` aceita `email` com `uploaded_by_user_id` nulo (CHECK `(source = 'upload') =
(uploaded_by_user_id is not null)`) e a tabela append-only `cargo_preview_email_intakes`
  (único `(company_id, provider_email_id)`). Identificadores ≤ 63 bytes (um de 71 foi encurtado antes de gerar).
  O rollback **recusa** enquanto houver prévia por e-mail. `db:generate` = `no_changes`; `db:test` 138 passam.
- **Worker, `src/cargo-preview-email/`:** token e hash (`preview-inbound-token.policy.ts`), endereço único
  (`mailbox-address.policy.ts`), listas (`preview-sender-allowlist.policy.ts`), remetente original
  (`forwarded-original-sender.policy.ts`), anexo (`preview-email-attachment.policy.ts`), cópia por valor do
  contrato do upload (`preview-upload-file.policy.ts`), leitura do MIME (`parse-forwarded-email.service.ts`),
  as barreiras (`intake-cargo-preview-email.use-case.ts`), o armazenamento + criação
  (`create-cargo-preview-from-email.service.ts`) e o banco (`drizzle-cargo-preview-email.repository.ts`,
  `cargo-preview-email-create.writer.ts`). O trilho de e-mail ganhou `previewIntake` e o resultado
  `{ outcome: 'preview' }`; o consumidor loga `inbound_email_preview_{accepted,rejected,rate_limited}`.
  O gateway ganhou `maxBytes` (nunca acima dos 25 MiB). A chave do MIME bruto virou
  `raw-email-object-key.policy.ts`, usada pelos dois trilhos.

### Contrato antes do código

Commit `515690d8e` (vermelho: 90 de 122 falhavam; os 32 verdes eram os do gateway, que já vinha pronto) e
`ef6c6c206` (implementação). Casos: CA1 (aceita, reenvio da mesma mensagem, mesmo arquivo em outra mensagem,
corrida), CA2 (recusa por encaminhador fora da lista, DKIM `not_aligned`/`absent`/`unverifiable`) e os hostis —
remetente original fora da lista, nome de exibição imitando o permitido, subdomínio, cabeçalho duplicado, dois
endereços, ausência, anexo grande demais (no limite passa, +1 byte recusa), extensão de planilha com bytes de PDF,
mais de um anexo, nenhum anexo, MIME aninhado a 60 níveis, cabeçalhos de 70 KiB, mensagem dentro da mensagem anexada,
`From` do MIME diferente do do provedor, token desconhecido/ligado a dois perfis, perfil não pronto, teto de abertas,
janela de e-mails, e a **regressão** do trilho da conversa (as suítes da 143/183 seguem verdes com o ramo ligado
sem reconhecer a mensagem). Integração contra Postgres: perfil por hash e por empresa, criação como o upload (prévia,
evento `uploaded` no canal `worker`, outbox, intake, MIME), mesma mensagem sob corrida, mesmo arquivo em outra
mensagem, duas mensagens com o mesmo arquivo ao mesmo tempo, teto de abertas, recusa idempotente e janela, trigger
append-only e uma passada de ponta a ponta com o MIME real.

### Gates (rodados nesta sessão)

| Gate                                                                                                                                        | Resultado                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cd apps/worker-transportada && bun run typecheck && bun run lint`                                                                          | verdes                                                                                                                                                                                                             |
| script `test` do worker                                                                                                                     | **1762 passam / 0 falham** (antes 1640; +122 do `cargo-preview-email.contract.test.ts`)                                                                                                                            |
| `./test/integration/cargo-preview-email-intake.integration.ts`                                                                              | 9 passam (Postgres 18 nativo descartável)                                                                                                                                                                          |
| `test:integration` do worker, completo, uma vez                                                                                             | 202 passam / **1 falha**: `osrm-routing-matrix.integration.test.ts` ("ponto fora da área") — usa o serviço OSRM de `ROUTING_MATRIX_URL`, sem relação com a mudança (distância 1 143 650 contra 4 511,2 do dataset) |
| `cd apps/api-transportada && bun run typecheck && bun run lint`                                                                             | verdes                                                                                                                                                                                                             |
| `bun --env-file=../../.env.test test --timeout 120000` (API)                                                                                | **10174 passam / 0 falham** (3 contratos de schema da 237 atualizados: colunas, CHECKs e `source`)                                                                                                                 |
| `bun run db:test`                                                                                                                           | 138 passam (a lista estática de migrations ganhou a nova) + `cargo-preview-email-intake.assertion.ts` (CHECKs, único, append-only, rollback que recusa e que desfaz)                                               |
| integrações da API tocadas (`cargo-preview`, `-resend`, `-unlink`, `-upload-limit`, `-trip-draft`, `contractor-receiving-profile`, `-list`) | verdes, um arquivo por vez                                                                                                                                                                                         |
| `bun run format:check` na raiz                                                                                                              | verde (o prettier reescreveu um contrato da 143 antes)                                                                                                                                                             |

### Mutações (script fora do repositório; cada arquivo restaurado; `git diff --quiet` limpo depois)

| Mutação                                                      | Testes que caem |
| ------------------------------------------------------------ | --------------- |
| allow-list do encaminhador ignorada                          | 8               |
| remetente original ignorado                                  | 7               |
| DKIM do encaminhador ignorado                                | 4               |
| teto do anexo ignorado                                       | 2               |
| tipo pelos bytes ignorado                                    | 2               |
| mais de um anexo aceito                                      | 2               |
| ramo captura mensagem sem token                              | 1               |
| teto do download do MIME removido                            | 1               |
| `From` do MIME (o que o DKIM cobre) não reconferido          | 1               |
| `From` duplicado na mensagem anexada aceito                  | 3               |
| limite de e-mails por contratante removido                   | 1               |
| profundidade do MIME sem limite                              | 1               |
| hash do token igual ao da conversa                           | 1               |
| reenvio do mesmo arquivo guarda arquivo duplicado            | 3               |
| bloco encaminhado: último em vez do primeiro                 | 1               |
| idempotência por mensagem removida do banco                  | 2               |
| teto de prévias abertas ignorado                             | 1               |
| prévia decide mesmo sem ser da prévia (regressão da 143/183) | 12              |
| gateway aceita teto acima de 25 MiB                          | 1               |
| bloco do texto de fora decide mesmo com mensagem anexada     | 6               |
| mensagem anexada aninhada vira candidata                     | 1               |

### Decisões que divergiram do texto do pedido

- **Duas listas separadas**, uma do encaminhador e outra do remetente original (proposta aprovada), e o CHECK de que
  o token exige as duas — o texto da spec (RF1) tinha uma lista só.
- **Janela de e-mails por contratante (20 por 300 s)**, sem registro: a spec cita rate limit como mitigação e a
  tabela dos e-mails serve de contador; o excesso é ignorado antes de baixar.
- **Reenvio do mesmo arquivo devolve a prévia existente, mesmo que ela tenha falhado** (o upload a reabre): a
  reabertura é follow-up; quem encaminha de novo depois de corrigir o perfil precisa de arquivo diferente ou da
  reabertura pelo painel.
- **MIME bruto só do e-mail aceito.** Recusa não grava corpo (RF3); o motivo e o resultado do DKIM ficam no registro.
- **`unverifiable` (DNS do DKIM fora) é recusa**, não retentativa: o usuário reenvia, e o registro diz por quê.
- **`e-mail ilegível` e `From` duplicado na mensagem de fora** viram `MIME_UNREADABLE`.

### Passos do usuário pendentes

1. MX/domínio de entrada no Resend (spec 143 T012) — nada disso foi tocado.
2. Gravar por SQL, no perfil: o hash do token (`sha256("transportada:cargo-preview-inbound:v1:" + token)`) e as
   duas listas — até a T4.6b; sem os três, a prévia por e-mail fica desligada.
3. **Encaminhar MANUALMENTE** a mensagem do contratante (inline ou como anexo) para `<token>@<domínio de entrada>`
   (T4.7a: encaminhamento automático/redirect do Gmail ou Outlook preserva o `From` do contratante e não cria bloco
   encaminhado — não é suportado; ver § T4.7a e `SECURITY.md`).

### Follow-ups

- **T4.6b** (rota `PUT` do token/listas e ficha); **T4.8** deve cobrir o MIME bruto da prévia; reabrir a prévia
  que falhou no reenvio por e-mail; `security-reviewer` e `opus` na **T4.7**; formatos de encaminhamento além de
  Gmail/Thunderbird/Apple/Outlook (o marcador é lista fechada) e anexos `inline` de assinatura que o cliente
  marque como `attachment` tornam o e-mail ambíguo — medir com e-mails reais.

### Não rodou

DNS, MX, Resend e qualquer envio ou recebimento real; o `make migration-test` (Docker do Makefile): o equivalente,
`bun run db:test`, rodou num Postgres 18 nativo descartável; o painel (não foi tocado); a revisão `opus` e a de
segurança (T4.7).

## T4.7a — correções das revisões `opus` (código e segurança) da T4.6 (2026-10-07)

A migration **ainda não foi publicada**: foi editada **no lugar** (migration, `rollback.sql`, `snapshot.json` e
schemas TS), sem migration nova. Entre a T4.6 e a T4.7a o `origin/staging` ganhou
`20261007033420_occurrence_declared_amount`, **posterior** ao nome original (`20261007024527`): com o runner do drizzle
(ordem por data da pasta) ela seria pulada num banco que já aplicou a de staging, e o snapshot formaria um fork.
Por isso, depois do `rebase origin/staging` (conflitos só em listas de testes de `package.json` e de migrations), a
pasta foi **renomeada** para `20261007040900_cargo_preview_email_intake`, o `snapshot.json` foi regenerado
(`prevIds` = o de `20261007033420`, `db:generate` = `no_changes`, o SQL gerado é o mesmo da migration escrita à mão) e
as referências (rollback, lista estática, docs) acompanharam. A decisão de renomear é da T4.7a; se a T4.6 já tivesse
sido publicada, seria migration nova.

### O que mudou, por achado

| #   | Achado                                              | Correção                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | DoS: DKIM sem teto de cabeçalho                     | `mime-header-bounds.policy.ts`: 64 KiB de seção (com fim de cabeçalho) e 2 KiB por linha desdobrada de `From`/`Return-Path`/`Sender`/`Reply-To`, **antes** do `dkimVerify` na prévia (`MIME_UNREADABLE`) **e** na conversa (DKIM `absent`, sem anexos)                            |
| 2   | `l=` aceito como alinhado                           | `dkim-alignment.policy.ts`: `canonBodyLengthLimited` nunca alinha (vale para a conversa)                                                                                                                                                                                          |
| 3   | Janela contava recusas e o excesso sumia            | dois contadores (20 passaram do DKIM / 100 antes dele), por `recorded_at`; uma linha `RATE_LIMITED` por contratante e janela; CHECK de `reason_code` ampliado; índice agora por `recorded_at`                                                                                     |
| 4   | Conversa perdia para a prévia                       | a conversa é procurada primeiro; a prévia só é consultada sem thread                                                                                                                                                                                                              |
| 5   | Reentrega apagava o MIME da vencedora               | `already_recorded` descarta só a planilha da tentativa; o MIME só sai se nenhuma linha o referencia (`isRawKept`)                                                                                                                                                                 |
| 6   | Parser do remetente original                        | Outlook texto/clássico, Apple pt-BR, `De:` dobrado, vários marcadores; recusa 2 `<`/`@`, comentário, grupo, `mailto:`, nome codificado sem endereço                                                                                                                               |
| 7   | `unverifiable` virava recusa permanente             | repete a entrega (erro de domínio → `retry`); só a última (`retryCount >= maxRetries`, 3) grava `FORWARDER_DKIM_UNVERIFIABLE`                                                                                                                                                     |
| 8   | Reenvio de prévia que falhou devolvia "aceito" mudo | resultado `replayed_existing`; log `inbound_email_preview_accepted` com `replay: true` e `previewStatus`; intake já guarda `is_replay` (sem coluna nova); a prévia **não** é reaberta (follow-up)                                                                                 |
| 9   | CHECK das listas fraco                              | 1–20 entradas de 3–254 caracteres, sem NULL/vazia/controle/`                                                                                                                                                                                                                      | `; `normalize` do worker ignora o que não é texto |
| 10  | Baixos                                              | `maxBytes` só finito; `ZIP_SIGNATURE` morta removida; `message/rfc822`, `TOO_MANY_OPEN_PREVIEWS`, `minio` e códigos repetidos viraram constante; writer dividido (208 → 127 + 136 linhas); erros de domínio; `rejecter` tipado; prefixo `email:` reservado no upload da API (400) |
| 11  | Hash e listas não saem                              | integração da API afirma o conjunto exato de chaves do `GET`/`PUT`, da lista e do `audit_logs` (antes e depois)                                                                                                                                                                   |
| 12  | Paridade                                            | contrato nos dois sentidos: corpo de `hasZipSignature`, `>` do teto, 960 KiB (calculado da API), `OPEN_STATUSES` e `>=` do 5, chaves de `cargo_previews`, do `details` e do payload, chave do objeto, colunas da tabela e do perfil, prefixo e códigos                            |

O contrato de paridade nos dois sentidos **achou um defeito real**: a cópia da tabela de e-mails no worker não tinha
`recorded_at`.

### Contrato antes do código (commits)

`51c956678` (API: listas, códigos e índice, vermelho em `db:test` pelo motivo certo: `['']` passava no CHECK antigo) →
`ef2fa2577`/`a331769f7` (migration e schemas) · `6ff09a020` (worker: 60 vermelhos de 202 + 7 de 12 na integração, cada um
pelo motivo do achado; a barreira de cabeçalho entrou como esqueleto que deixa tudo passar) → `b62548731` (código) ·
`7ef3b10e9` (API: prefixo reservado vermelho; hash/listas) → `2ed598966` · `780a7443c` (paridade e mutações) · `bf4e1784c` (o prefixo vira constante copiada) · `6e726bb66` (renomear a migration e refazer a cadeia).

### Gates (rodados nesta sessão)

| Gate                                                                                                                           | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| worker `bun run typecheck && bun run lint`                                                                                     | verdes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| script `test` do worker                                                                                                        | **1848 passam / 0 falham** (antes 1762)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `./test/integration/cargo-preview-email-intake.integration.ts` (Postgres 18 nativo descartável)                                | 12 passam (antes 9) — banco em uso impresso: `t47a_worker` na porta 55947, `DATABASE_URL` sobrescrito sobre `.env.test`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| API `bun run typecheck && bun run lint`                                                                                        | verdes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `bun --env-file=../../.env.test test --timeout 120000` (API)                                                                   | **10185 passam / 0 falham** (antes 10174: +3 desta tarefa e +8 que o rebase trouxe de staging; 25 pulados, os de Postgres sem URL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `bun run db:test` (nativo) e `make migration-test` (Docker)                                                                    | 141 passam nos dois (138 + 3 do rebase) (migration + rollback + reaplica, CHECKs novos, índice por `recorded_at`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test:integration` completo do worker, uma vez por banco novo (Postgres 18 nativo; `DATABASE_URL` sobrescrito, banco impresso) | 204 passam / **2 falham**, as duas **sem relação com a mudança**: `osrm-routing-matrix` (dataset do OSRM local) e `contractor-mail-inbound-outbox` ("does not let a second claim…"), **flaky pré-existente**: no `origin/staging` limpo caiu em 1 de 4 execuções completas, e isolado num banco novo caiu em 1 de 3 (hipótese: `new Date()` em ms contra `occurred_at` em µs, quando semeia e reivindica no mesmo milissegundo). Num banco reaproveitado por muitas execuções, `cargo-preview-reevaluation` também caiu (a fila do relay acumula pedidos pendentes de todas as execuções; `limit: 50`) e passou no banco novo |
| integrações da API tocadas, um arquivo por vez                                                                                 | `cargo-preview` (6), `-resend` (2), `-unlink` (2), `-upload-limit` (2), `-trip-draft` (5), `contractor-receiving-profile` (4, +1 nova), `-list` (1): verdes                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bun run format:check` na raiz                                                                                                 | verde                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Mutações (script fora do repositório; cada arquivo restaurado; `git diff --quiet` limpo depois)

| Mutação                                                         | Testes que caem                                |
| --------------------------------------------------------------- | ---------------------------------------------- |
| sem a barreira de cabeçalho na prévia                           | 3                                              |
| sem a barreira de cabeçalho na conversa                         | 1                                              |
| `l=` aceito como alinhado                                       | 2                                              |
| conversa não vence (prévia sempre consultada)                   | 5                                              |
| `already_recorded` apaga o MIME                                 | 1 (contrato) + 2 (integração, uma é a corrida) |
| parser pega o primeiro `<>` (sem âncora no fim)                 | 3                                              |
| `unverifiable` volta a ser recusa permanente                    | 1                                              |
| rastro `RATE_LIMITED` não gravado                               | 2                                              |
| janela pelo `received_at` em vez do `recorded_at`               | 1                                              |
| contador "autenticados" conta tudo                              | 1                                              |
| rastro `RATE_LIMITED` sem a checagem de "um por janela"         | 1                                              |
| status da prévia reenviada fixo em `queued`                     | 1                                              |
| `>=` do teto de 5 vira `>` no worker                            | 1 (paridade)                                   |
| `every` vira `some` na assinatura zip do worker                 | 1 (paridade)                                   |
| coluna extra no insert de `cargo_previews`                      | 1 (paridade)                                   |
| prefixo `email:` diferente no worker                            | 2                                              |
| código de recusa renomeado no worker                            | 1 (paridade)                                   |
| `toProfile` da API espalha a linha inteira (vaza hash e listas) | 1                                              |
| upload da API sem a reserva do prefixo                          | 2                                              |

### O que muda de observável no trilho da 143/183

- **Item 1:** mensagem com cabeçalho fora do limite (seção > 64 KiB, sem fim de cabeçalho, ou `From`/`Return-Path`/
  `Sender`/`Reply-To` > 2 KiB) é gravada com `dkim_result = 'absent'`, **sem verificar DKIM e sem extrair anexos**.
  Antes, a `mailauth` rodava (e podia travar o worker). Mensagem comum não muda. Os contratos que usavam `Buffer.alloc(0)`
  ou `'mime'` como MIME bruto precisaram de um MIME com fim de cabeçalho.
- **Item 2:** a política de alinhamento é compartilhada: uma resposta cuja **única** assinatura alinhada tem `l=` passa
  de `aligned` a `not_aligned` e deixa de decidir a identidade/taxa. Mais rígido, de propósito.
- **Item 4:** a ordem do trilho mudou — a thread é procurada **antes** da prévia. Efeito: mensagem de conversa não
  consulta mais `findProfilesByTokenHashes`; `hasIntake` segue rodando para toda mensagem.

### Decisões que divergiram do texto do pedido

- **Item 8 sem coluna nova:** `is_replay` + `preview_id` já registram o reenvio; o status é derivável por junção. O
  status entra no resultado e no log, não numa coluna (o dado é mutável).
- **Item 9, "e registra":** o guard do worker ignora entrada que não é texto sem log — a política é pura, não há logger
  na barreira, e o CHECK do banco já recusa NULL/vazio. Segunda barreira, não primeira.
- **`unverifiable` retentável:** o consumidor **tem** contador (`retryCount`, `maxRetries` = 3, 5 s); nenhuma
  infraestrutura nova.
- **Prefixo `email:` reservado só no upload da prévia**, não no `readIdempotencyKey` compartilhado (a chegada usa
  outra tabela). Reserva sem distinção de caixa (`EMAIL:` também), por clareza.
- **O erro de limpeza (`catch` de `storeAndCreatePreview`) segue apagando o que a tentativa subiu**, MIME incluído:
  se o banco falhar numa corrida com a vencedora, a limpeza pode apagar o MIME dela (janela estreita, exige duplicata
  simultânea **e** falha de banco). Não foi mudado — o pedido dizia `already_recorded`. Registrado como residual.

### Passos do usuário e `[NEEDS CLARIFICATION]`

Sem mudança nos passos de MX/Resend/listas, mais: o token deve ser gerado com `openssl rand` (≥ 130 bits; L4 no
`SECURITY.md`). **Encaminhamento automático (regra/redirect) não é suportado**; decisão pendente do usuário se for preciso.

### Ordem de deploy

`.github/workflows/deploy.yml`: `deploy-api` (com `preDeployCommand` das migrations e `assert-migrations`) vem **antes**
de `deploy-worker`, que tem `needs: deploy-api` e recusa subir se ele falhou ou foi cancelado. Como `hasIntake` roda para
toda mensagem de conversa, o worker novo falharia em todo e-mail de conversa sem a migration — a ordem real o impede;
reverter só a API quebraria o trilho.

### Não rodou

DNS, MX, Resend e qualquer envio ou recebimento real; o painel (não foi tocado — T4.7b); push; staging e produção.

## T4.7b — o painel aceita `source: 'email'` na prévia (2026-10-07)

Só `apps/frontend-transportada` e docs/prints desta spec; API e worker intocados. **Sem push**: há tela visível, e a publicação espera os
prints aprovados. Commits: `c54939b8b` (contratos vermelhos), `8a5419528` (implementação) e o commit de prints e evidência.

### O defeito (HIGH-1 da revisão de código, confirmado)

A API grava `source = 'email'` nas prévias que o worker cria pela caixa de entrada. O painel conhecia só `CARGO_PREVIEW_SOURCES = ['upload']`:
`isPreviewSummary` recusava a linha e `toPreviewPage` lançava `RESPONSE_INVALID` para a **página inteira** de `/recebimento/previas`; o detalhe
da prévia por e-mail quebrava igual. **O formato real da resposta** (lido em `cargo-preview-view.mapper.ts` e `cargo-preview.types.ts` da API): o
resumo nunca carregou autor (`uploadedByUserId` não está em `CargoPreviewSummary`, só no banco, onde é nulo para e-mail). Portanto as chaves
exatas do painel **não mudam** entre as duas origens, e nada no painel assumia usuário que enviou (`grep` por `uploaded`/`uploader` no módulo: zero).
A única divergência era o valor de `source`.

### O que mudou

- `cargoPreview.constant.ts`: `CARGO_PREVIEW_SOURCES = ['email', 'upload']`; as guardas usam a lista, sem mudança de chaves.
- `CargoPreviewSourceBadge` (neutro, mesma classe `.badge` do selo de situação, `data-preview-source`) na célula do arquivo da lista e nos dados
  do detalhe; textos `preview.source.email` ("Enviada por e-mail" / "Sent by email") e `preview.source.upload` ("Enviada no painel" / "Sent in the
  panel"). Sem endereço de e-mail nem nome: a prévia por e-mail não tem autor.
- A célula do arquivo ganhou um `<div>` e `data-file-name` (na tabela empilhada, dois filhos viram dois itens do `grid` e o selo cai sob o rótulo da
  coluna — achado no primeiro print, corrigido, e o spec de prints ganhou `readBadgeMisalignment`). O helper `rowFiles` do contrato da lista lê
  `[data-file-name]` em vez do texto da célula inteira.

### Contratos (vermelhos antes, comitados)

`test/cargo-receiving/preview-source.contract.ts` (paridade lendo a constante da API; lista com as duas origens; detalhe por e-mail; chave de autor
continua recusada; origem desconhecida recusada nas duas respostas; `upload` como antes; **cliente HTTP real** com as duas origens, porque o dublê
dos contratos de DOM não passa pelas guardas; rótulos nos dois idiomas, curtos e sem `@`) e `test/trip-hooks/cargo-preview-source.contract.ts` (DOM:
lista com as duas origens, cada linha com o seu rótulo, sem `@`; detalhe por e-mail e por envio; instala `stubVisibleLayout()`; nenhum
`expect(nó).toBeNull()` dentro de `waitFor`). Vermelho pelo motivo certo: 9 e 3 falhas, todas por origem desconhecida ou rótulo ausente.

### Gates

| Gate                                    | Antes (T4.7a)      | Depois                          |
| --------------------------------------- | ------------------ | ------------------------------- |
| `bun run test` (contratos, 36 arquivos) | 7214 pass          | 7225 pass                       |
| `bun run test:hooks` (DOM)              | 838 pass           | 842 pass                        |
| `bun run typecheck`                     | 0 erros            | 0 erros                         |
| `bun run lint`                          | 0 erros, 16 avisos | 0 erros, 16 avisos (os antigos) |

### Estabilidade do DOM

`bun run test:hooks`: **10 execuções seguidas, todas 842 pass / 0 fail**, e mais **4 com a CPU ocupada** por 11 processos `yes` (um por núcleo,
encerrados pelo PID que esta sessão iniciou): 4 de 4 verdes.

### Mutações (contratos de contrato / DOM, falhas por execução)

| #   | Mutação                                                                                          | Contratos | DOM |
| --- | ------------------------------------------------------------------------------------------------ | --------- | --- |
| M1  | `CARGO_PREVIEW_SOURCES = ['upload']` (guarda só `upload`)                                        | 7         | 0   |
| M2  | rótulo de e-mail trocado pelo do painel                                                          | 1         | 2   |
| M3  | `uploadedByUserId` exigido nas chaves (autor nulo quebra)                                        | 16        | 0   |
| M4  | guarda local `isOneOf(value.source, ['upload'])` (uma linha por e-mail derruba a página inteira) | 5         | 0   |
| M5  | detalhe sem o selo de origem                                                                     | 0         | 2   |
| M6  | lista sem o selo de origem                                                                       | 0         | 1   |
| M7  | guarda aceita qualquer `string` como origem                                                      | 1         | 0   |

As 7 reprovaram ao menos um contrato; cada uma restaurada (`git diff --quiet` verde). O DOM não pega M1/M3/M4 de propósito: o dublê do cliente
dispensa as guardas, e quem as cobre é o contrato com o cliente HTTP real.

### Revisão de design (prints, `getComputedStyle`, geometria)

12 PNGs em `specs/237-.../prints/` (`previa-origem-email-{lista,detalhe}-{375,768,1280}-{dark,light}.png`), gerados por
`test/spec-237-previa-origem-prints.smoke.spec.ts` (fora da CI): build com `VITE_SMOKE_AUTH_BYPASS=true` em pasta temporária, `vite preview` na
porta 53431 (encerrado pelo PID iniciado aqui, sem `pkill`), config do Playwright descartável e build apagados, API 100% dublada, dados fictícios.
13 testes verdes.

- **Vizinho (375, escuro):** o selo de origem e o selo de situação da mesma linha são **idênticos** por estilo calculado: `SFMono-Regular`
  11,52 px, peso 400, caixa alta, borda 1 px, altura 24 px (mesma classe `.badge`).
- **Contraste (WCAG, mínimo por elemento nos 12 prints):** selo de origem **5,62:1 no escuro** e **5,36:1 no claro**; selo de situação 5,88 / 5,50;
  dados do cabeçalho 6,95 / 5,27; célula 14,48 / 12,66 — todos ≥ 4,5:1 (o teste reprova abaixo).
- **Alvo de toque a 375 px:** nenhum botão da tabela nem da navegação abaixo de 44 px, nas duas telas e nos dois temas.
- **Geometria:** nenhuma rolagem horizontal da página nos 12 prints; `expectNoClipping` a 375 px nas duas telas; selo inteiro dentro da célula/item;
  nenhuma célula invadindo a vizinha; selo alinhado ao nome do arquivo na lista empilhada.
- Olhado nos PNGs: lista 375 escuro e claro, lista 768 escuro, detalhe 1280 claro.

### Pendência registrada (anterior a esta tarefa, não consertada)

A tabela de prévias tem larguras fixas que somam 71 rem (`table-layout: fixed`, `--stacked-min-width: 56rem`): a 768 px as colunas Linhas,
Situação e Ações ficam atrás da rolagem **da região da tabela** (`role="region"`, focável), não da página — por isso o corte aparece no recorte
do print 768 e `expectNoClipping` só roda a 375 px, como nos prints da T4.4. Esta tarefa não mexeu em nenhuma largura de coluna (o selo mora na
coluna Arquivo, de 14 rem, que ele não excede). Reduzir as larguras é decisão de design própria.

### Decisões que divergiram do texto do pedido

1. **Sem coluna nova "Origem":** o selo vai na célula do arquivo. Uma coluna a mais empurraria a tabela, que já excede a largura a 768 px, para mais
   longe; o rótulo "Origem" também não tem ordenação no servidor.
2. **Sem contrato de "autor nulo/ausente":** a API não manda autor em nenhuma origem, então o contrato afirma o formato real (mesmas chaves, chave de
   autor recusada), em vez de um autor nulo que nunca chega.

### Não rodou

Push, staging e produção; `make check` completo, `make smoke`/smoke da CI e `make migration-test` (nada de schema); API e worker (não foram
tocados); leitura de qualquer banco; envio ou recebimento real de e-mail.

## T4.7c — correções da segunda passada de segurança `opus` sobre a T4.7a (2026-10-07)

A migration `20261007040900_cargo_preview_email_intake` **continua não publicada**: foi editada **no lugar** (só o
CHECK de `reason_code` ganhou `FORWARDER_FROM_MISMATCH`, na migration e no `snapshot.json`; `rollback.sql` não muda,
ele derruba a tabela inteira). `db:generate` = `no_changes`. Painel não tocado.

### O que mudou, por achado

| #   | Achado                                                | Correção                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [ALTO] NOVO-1: o `From` lido ≠ o `From` alinhado      | (a) `mailbox-address.policy.ts`: o endereço lido tem de estar **literalmente** no fim do valor original (`<a"@evil.example>"@t.example>` recusa); (b) `verifyWithHeaderFrom` devolve o `headerFrom` da `mailauth` e `passPreviewContentGates` exige **um só** igual ao endereço lido do MIME, senão `FORWARDER_FROM_MISMATCH` |
| 2   | [ALTO] NOVO-2: leitor de MIME da conversa sem limite  | `inbound-mail-parts.service.ts`: PostalMime com `forceRfc822Attachments`, `maxHeadersSize` 64 KiB, `maxNestingDepth` 6; a `message/rfc822` aninhada é aberta **pelo worker**, depois de `hasBoundedMimeHeaders` e até 3 níveis (ver "Decisões"); a prévia aplica a barreira à mensagem anexada                                |
| 3   | [ALTO] NOVO-3: assinaturas sem teto                   | barreira: 8 `DKIM-Signature` e 3 de cada `ARC-*`; gateway: prazo de 15 s (`DKIM_VERIFICATION_DEADLINE_MS`, `Promise.race` com o timer limpo), `unverifiable` ao estourar e resolvedor que recusa na hora depois do prazo; a rejeição tardia da `mailauth` não vira rejeição não tratada                                       |
| 4   | [MÉDIO] H1-b: o teto por linha era contornável        | `mime-header-fields.policy.ts` lê campos pela regra da `mailauth` (`FIELD_START`, linha que não abre campo soma no de cima, nome sem espaços); 2 KiB nos 8 campos de endereço (soma dos repetidos) e 8 KiB nos outros                                                                                                         |
| 5   | [MÉDIO] M2: o contador de recusas trancava o legítimo | autenticados (20) fecham download e DKIM depois das checagens baratas; não autenticados (100) só param de **gravar** (`createPreviewEmailRejecter`: sem linha, só o rastro `RATE_LIMITED` único) — a avaliação continua                                                                                                       |
| 6   | [BAIXO] vírgula no nome de exibição sem aspas         | `NAME_FORBIDDEN` deixa de proibir `,`; `Silva, João <a@x>` é uma caixa, `a@x, b@y` e `Silva, João <a@x>, <b@y>` seguem recusa                                                                                                                                                                                                 |

### Contrato antes do código (commits)

`9bf4cd938` (worker: **53 vermelhos** — 47 na entrada de prévia, 5 no verificador e 1 na conversa —, cada um pelo motivo do achado — os de barreira recusavam
nada, o PoC do NOVO-1 era `accepted` com o `From` do Resend limpo e com o literal, a `verify` da conversa levava 1,2 s
para 8 consultas em série, a aninhada de 62 KiB levava ~1,8 s, e a janela cheia de não autenticados trancava o
legítimo) → `486e9ca4a` (API: código e CHECK; **vermelho em `db:test`** ao tirar o código da migration) → `8bce6bc58`
(worker: código, harness e mocks de integração para a porta nova).

### Medições (ms, esta máquina)

| Caso                                                                                | Antes                   | Depois                                    |
| ----------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------- |
| `To` aninhado de 62 / 128 / 256 KiB no leitor da conversa                           | 4 900 / 19 300 / 84 000 | 1 / 1 / 1                                 |
| mensagem anexada da prévia com `Cc` de ~56 KiB (contrato)                           | 1 745                   | recusa (`undefined`) em < 1 000           |
| 8 assinaturas, DNS que nunca responde (`dnsTimeoutMs` 150)                          | 1 211 (8 × 150, série)  | 300 (o prazo do teste); sem consulta nova |
| pior cabeçalho que PASSA (8 campos de endereço de 1,9 KiB, três padrões do revisor) | —                       | `mailauth` 5–10; `PostalMime` 9–18        |
| barreira sobre esse pior caso                                                       | —                       | 0,1–0,4                                   |

### Gates (rodados nesta sessão)

| Gate                                                                                                                     | Resultado                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| worker `bun run typecheck && bun run lint`                                                                               | verdes                                                                                                                               |
| script `test` do worker                                                                                                  | **1926 passam / 0 falham** (antes 1848: +78)                                                                                         |
| `./test/integration/cargo-preview-email-intake.integration.ts` (Postgres 18 nativo descartável)                          | 13 passam (antes 12) — banco impresso: `t47c_worker`, porta 56437, `DATABASE_URL` sobrescrito sobre `.env.test`                      |
| `test:integration` completo do worker, **uma vez** (Postgres 18 nativo, banco novo `t47c_full`, `DATABASE_URL` impresso) | **203 passam / 4 pulam / 0 falham** (sem `osrm-routing-matrix` falhando nem o flaky `contractor-mail-inbound-outbox` nesta execução) |
| API `bun run typecheck && bun run lint`                                                                                  | verdes                                                                                                                               |
| `bun --env-file=../../.env.test test --timeout 120000` (API)                                                             | **10185 passam / 0 falham** (25 pulados, os de Postgres sem URL), igual a antes                                                      |
| `bun run db:test` (nativo) e `make migration-test` (Docker)                                                              | 141 passam nos dois (a asserção nova insere `FORWARDER_FROM_MISMATCH`)                                                               |
| `bun run db:generate`                                                                                                    | `no_changes`                                                                                                                         |

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout`; `git diff --quiet` limpo depois)

| Mutação                                                     | Testes que caem          |
| ----------------------------------------------------------- | ------------------------ |
| leitor de remetente sem a âncora do `<…>` literal           | 6                        |
| `,` proibida de novo no nome de exibição                    | 1                        |
| sem a conferência do `headerFrom`                           | 4                        |
| leitor da conversa sem `forceRfc822Attachments`             | 1 (a aninhada de 62 KiB) |
| leitor da conversa sem a barreira da aninhada               | 1                        |
| prévia: mensagem anexada sem a barreira                     | 1                        |
| barreira sem o teto de assinaturas                          | 10                       |
| sem o prazo total (prazo de 1e9 ms)                         | 3                        |
| prazo sem recusar o DNS depois de vencido                   | 1                        |
| barreira com a regra de linha antiga (`[ \t]` no começo)    | 4                        |
| barreira sem a soma dos repetidos                           | 3                        |
| barreira sem o teto de 8 KiB dos outros campos              | 1                        |
| contador de não autenticados volta a parar a avaliação      | 5                        |
| rejecter grava mesmo com a janela de não autenticados cheia | 3                        |
| `FORWARDER_FROM_MISMATCH` fora do CHECK da migration        | 1 (`db:test`)            |

### O formato real de `received.from` do Resend

O schema (`resend-mail.gateway.ts`) declara `from: z.string().min(1)`, e a documentação do `GET
/emails/receiving/{id}` mostra `"Acme <onboarding@resend.dev>"` — uma **string já no formato `Nome <endereço>`**, não um
objeto. O código não diz (e sem rede não se confirma) se é o cabeçalho literal ou a caixa re-serializada pelo Resend. Por
isso o contrato prova os **dois**: o literal do PoC, o formato sem `<>` e o do cabeçalho limpo com o MIME hostil. Nos dois
o ataque é recusado (`FORWARDER_NOT_ALLOWED` quando o leitor recusa o `from` do provedor; `MIME_UNREADABLE` quando o
`from` é limpo e o MIME é hostil; `FORWARDER_FROM_MISMATCH` quando só o `headerFrom` denuncia).

### O que muda de observável no trilho da 143/183

- **Barreira de cabeçalho (compartilhada):** além dos 64 KiB, cada campo desdobrado de **`from`, `reply-to`,
  `return-path`, `sender`, `to`, `cc`, `bcc`, `delivered-to`** passa a ter teto de **2 KiB** (soma dos repetidos) e os
  outros **8 KiB**; mais de 8 `DKIM-Signature` ou 3 `ARC-*` do mesmo nome também recusam. Mensagem recusada é gravada
  como DKIM `absent`, sem verificar e **sem anexos**. ⚠️ **Falso positivo possível:** um `To`/`Cc` com mais de ~60
  endereços (resposta a todos de uma lista grande) passa de 2 KiB e perderia anexos e DKIM. O pedido fixou o 2 KiB; fica
  registrado para a decisão do usuário.
- **Prazo do DKIM:** `verify` da conversa também passa a ter 15 s; estourou, `dkim_result = 'unverifiable'` (já era um
  valor possível). Mensagem comum não muda.
- **Anexos da conversa:** o resultado é o de antes para mensagem comum e para `message/rfc822` aninhada **comum** (os
  anexos de dentro entram na mesma posição). Muda só para a aninhada **hostil** (cabeçalho fora da barreira) ou **funda
  demais** (> 3 níveis; o PostalMime aceitava 10): conta como uma recusa em `skipped` e o resto da mensagem é lido (antes
  o `parse` inteiro lançava e **todos** os anexos se perdiam). MIME aninhado com mais de 6 níveis de `multipart` deixa de
  parsear (`maxNestingDepth` 6; o PostalMime aceitava 256).
- O trilho da conversa **não** passou a conferir o `headerFrom` (ver "Decisões" e `SECURITY.md`, pendência 9).

### Decisões que divergiram do texto do pedido

- **Item 2: `forceRfc822Attachments` sozinho mudaria o resultado visível dos anexos da conversa** — a `message/rfc822`
  sem disposição (ou `inline`) deixaria de ter os anexos de dentro extraídos e viraria uma recusa. Em vez de parar,
  mantive o efeito visível e tirei o custo: o PostalMime não abre a aninhada e o worker a abre depois da MESMA barreira
  de cabeçalho, até 3 níveis (arquivo novo `inbound-mail-parts.service.ts`, contrato com PDF dentro de uma aninhada
  comum, igual antes). Diferenças reais: profundidade 3 (era 10), `maxNestingDepth` 6 (era 256) e a aninhada hostil
  conta como recusa sem derrubar o resto.
- **Item 4: a soma dos repetidos só vale nos campos de endereço.** Nos "outros" ficou o teto de 8 KiB por campo, sem
  soma: uma cadeia legítima de `Received` (10–20 saltos) passa de 8 KiB somada, e o custo que o teto cobre
  (`addressparser`) não existe nesses campos.
- **Item 1(b): a conferência está em `passPreviewContentGates`**, depois de o MIME ser lido e **antes** da lista do
  encaminhador (um `From` que a `mailauth` leu diferente é `FORWARDER_FROM_MISMATCH`, mesmo que o endereço nosso esteja
  na lista). O `From` do provedor segue só como checagem barata antes do download; não se exige igualdade dele com o do
  MIME (risco de falso positivo sem ganho: o que o DKIM cobre é o do MIME).
- **A porta do verificador ganhou um método** (`verifyWithHeaderFrom`) em vez de mudar o retorno de `verify`: a
  conversa continua com `verify`, e os ~15 dublês dela não mudam.
- **Contador de não autenticados cheio devolve `rejected` (com o código real)**, não `rate_limited`: a mensagem foi
  avaliada; só a linha não é gravada. `rate_limited` fica para o teto de autenticados.
- **[BAIXO] dedupe por `Message-ID` não foi feito:** pede coluna e índice em `cargo_preview_email_intakes` (migration
  ainda não publicada, mas o desenho do índice — por contratante, com a retenção da T4.8 — é decisão que merece a
  T4.8). Registrado como follow-up em `SECURITY.md` (pendência 11).

### Não rodou

DNS, MX, Resend e qualquer envio ou recebimento real; o painel; push; staging e produção. O `format:check` da raiz foi
conferido (ver abaixo); nada leu banco de produção.

## T4.7d — correções da terceira passada de segurança `opus` sobre a T4.7c (2026-10-07)

A migration `20261007040900_cargo_preview_email_intake` **continua não publicada e não foi editada** (nenhum item exigiu
coluna, CHECK ou índice novo); a API e o painel não foram tocados. Só `apps/worker-transportada` e os documentos.

### O que mudou, por achado

| #   | Achado                                                           | Correção                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [ALTO] NOVO-2 restante: sem teto de partes e de aninhadas        | `mime-part-bounds.policy.ts` conta as linhas que começam com `--` (as únicas que o PostalMime reconhece como fronteira) antes do leitor: mais de 200 recusa — a conversa devolve `{ parts: [], skippedNestedMessages: 1 }`, a prévia trata como MIME ilegível. As aninhadas abertas da conversa gastam um orçamento de 5 por mensagem, compartilhado entre os níveis; o resto conta como recusa |
| 2   | [MÉDIO] D-A: barreira e PostalMime separam campos diferente      | `hasDivergentFieldName`: linha que não começa com espaço/tab e tem espaço exótico (`\f`, `\v`, NEL, NBSP, espaços Unicode, BOM) antes do primeiro `:` recusa, avaliada em latin1 **e** em UTF-8                                                                                                                                                                                                 |
| 3   | [MÉDIO] Tetos de campo de destinatário                           | `from`, `sender`, `reply-to`, `return-path` seguem em 2 KiB (e a soma dos repetidos); `to`, `cc`, `bcc`, `delivered-to` passam a 8 KiB por campo e **16 KiB** na soma dos quatro (`MIME_HEADER_LIMITS.identity*`/`recipient*`)                                                                                                                                                                  |
| 4+5 | [MÉDIO] D-B e D-C: recusa `aligned` que o encaminhador não prova | `PREVIEW_EMAIL_UNPROVEN_REJECTIONS` (seis códigos) e `countsAsAuthenticatedIntake`: o contador de autenticados (SQL e rejecter, a mesma lista) exige `aligned` **e** motivo fora da lista; as seis recusas contam nas recusas (teto 100, só para de gravar). **Escolhi não gravar sem `aligned`**: o dado gravado continua verdadeiro e o corte fica numa lista só, sem migration               |
| 6   | [MÉDIO] `unverifiable` por DNS do atacante repete a entrega      | `isTransientFailure` exige `status.aligned` (a `mailauth` o calcula antes do DNS): assinatura de domínio alheio com o DNS mudo vira `not_aligned`                                                                                                                                                                                                                                               |
| 7   | [MÉDIO] Pendência 9 — identidade da conversa                     | a conversa usa `verifyWithHeaderFrom` (porta `VerifyDkimHeaderFromPort`) e `resolveConversationDkimResult`: `aligned` só com **um** `headerFrom` igual ao remetente gravado (sem distinguir caixa), senão `not_aligned`                                                                                                                                                                         |

### Contrato antes do código (commits)

`4b9dbe167` — **49 vermelhos**, cada um pelo motivo do achado: 8 (partes e orçamento; o de 20 000 partes levou 9,7 s e o de
1000 aninhadas 4,8 s na leitura antiga), 27 (barreira: espaço exótico em `To`/`From` × 9 variantes, destinatários, soma de 16 KiB,
pior caso que passa), 6 (as seis recusas gravavam linha com a janela de recusas cheia), 3 (integração: contador e 25 reenvios),
3 (DKIM de domínio alheio: política, gateway e intake) e 2 (identidade da conversa). Depois: `d47eca7ca` (partes, aninhadas,
cabeçalho, destinatários), `773864c07` (janela), `a62073563` (DKIM alheio), `9de36ca20` (identidade da conversa).

### Medições (ms, esta máquina)

| Caso                                                                                       | Antes                | Depois                          |
| ------------------------------------------------------------------------------------------ | -------------------- | ------------------------------- |
| 5000 aninhadas com `To`+`Cc` de 2 KiB (20,5 MiB)                                           | 25 500 (revisor)     | 4                               |
| 1000 aninhadas com `To`+`Cc` de 2 KiB                                                      | 4 805                | 0                               |
| 20 000 partes PDF pequenas (conversa)                                                      | 9 734                | 0                               |
| 20 000 partes (prévia, `parseForwardedEmail`)                                              | 8 586                | 1                               |
| 200 000 aninhadas pequenas (13 MiB)                                                        | > 180 000 (revisor)  | 2                               |
| 60 aninhadas dentro do teto de partes                                                      | todas abertas        | 31 (5 abertas, 55 em `skipped`) |
| pior que PASSA: 5 aninhadas com `To`+`Cc` de 8 KiB do pior padrão                          | —                    | **~370** (limitado, não zero)   |
| pior que PASSA: 198 partes com 60 KiB de `Content-Description` cada (11,4 MiB)             | —                    | 20                              |
| pior cabeçalho que passa (identidade 1,9 KiB ×4, `to`+`cc` 8 KiB): `mailauth` / PostalMime | —                    | 6–8 / 25–81                     |
| sete `To\f:` de 8 KiB (D-A), barreira                                                      | 250–500 (PostalMime) | recusa em 0,1                   |

O pior caso que passa no item 1 (~370 ms) **não** chega a milissegundos, mas é limitado (6 leituras no máximo, cada uma sob os
tetos de cabeçalho); **não** implementei `worker_thread` com prazo (ADR-0053): o laço deixou de ser ilimitado e o anexo
legítimo permanece idêntico. Fica como passo seguinte se o teto ainda doer (`SECURITY.md`, 2026-10-06).

### Gates (rodados nesta sessão)

| Gate                                                                                            | Resultado                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| worker `bun run typecheck && bun run lint`                                                      | verdes                                                                                                                                  |
| script `test` do worker                                                                         | **1989 passam / 0 falham** (antes 1926: +63)                                                                                            |
| `./test/integration/cargo-preview-email-intake.integration.ts` (Postgres 18 nativo descartável) | 15 passam (antes 13) — banco impresso: `t47d_worker`, `127.0.0.1:56437`, `DATABASE_URL` sobrescrito sobre `.env.test`                   |
| `test:integration` completo do worker, uma vez (banco novo `t47d_full`, mesmo servidor)         | **204 passam / 4 pulam / 1 falha**: o flaky `contractor-mail-inbound-outbox` (ver abaixo); sem `osrm-routing-matrix` falhando desta vez |
| `bun run format:check` (raiz)                                                                   | verde                                                                                                                                   |

O flaky `contractor-mail-inbound-outbox.integration.test.ts` falhou na execução completa e **depois falhou/passou sozinho em
duas execuções seguidas** no mesmo banco (reivindica linhas que sobraram de outros arquivos): arquivos não tocados desde a spec 143.

### Mutações (script fora do repositório; cada arquivo restaurado por `git checkout`; `git diff --quiet` limpo depois)

| Mutação                                                             | Testes que caem               |
| ------------------------------------------------------------------- | ----------------------------- |
| sem a contagem de partes (conversa e prévia)                        | 6                             |
| prévia sem a contagem de partes                                     | 2                             |
| sem o orçamento de aninhadas                                        | 2                             |
| sem a recusa de espaço exótico                                      | 18                            |
| destinatário com 2 KiB de novo                                      | 9                             |
| sem a soma de 16 KiB dos destinatários                              | 2                             |
| contador de autenticados soma de novo as seis recusas (lista vazia) | 6 (contrato) + 6 (integração) |
| reenvio sem remetente original volta a consumir a janela            | 1 (contrato) + 2 (integração) |
| `unverifiable` por assinatura de domínio alheio volta a repetir     | 3                             |
| identidade da conversa sem a conferência                            | 2                             |

### O que muda de observável no trilho da 143/183

- **Cabeçalho (compartilhado):** `to`, `cc`, `bcc`, `delivered-to` passam de 2 para 8 KiB por campo (16 KiB na soma): menos
  falso positivo para responder a todos (8 KiB cobrem ~125 endereços com nome; **150 em um campo só, 9,3 KiB, ainda recusa**,
  e a mensagem recusada continua gravada como DKIM `absent` e sem anexos). Linha com nome de campo de espaço exótico antes
  do `:` também recusa (nenhum e-mail legítimo tem isso).
- **Partes:** mensagem com mais de 200 linhas começando por `--` (texto citado, régua) passa a ter **nenhum anexo** (uma recusa
  em `skipped`); as aninhadas inline abertas passam de ilimitadas a **5 por mensagem** (a 6ª em diante conta como recusa). Os
  anexos legítimos (PDF em aninhada comum, `.eml` anexo, profundidade 2, base64, digest) saem **idênticos** (contrato).
- **DKIM:** assinatura só de domínio alheio com o DNS dele fora do ar grava `not_aligned` em vez de `unverifiable`.
- **Identidade (a única mudança de comportamento da conversa fora dos tetos):** o `dkim_result` só é `aligned` quando o `From`
  que a `mailauth` alinhou é um só e é o remetente gravado; a mensagem com `From` assinado diferente do `from` do provedor
  continua na conversa, **sem o selo de verificada** (`not_aligned`). `SECURITY.md`, pendência 9, fechada.

### Decisões que divergiram do texto do pedido

- **Itens 4/5 numa só correção:** em vez de gravar as recusas sem `aligned`, mantive o dado e cortei no contador (lista
  `PREVIEW_EMAIL_UNPROVEN_REJECTIONS`). O teto separado de recusas é o `maxUnauthenticated` (100), que já só impedia
  inundação de linhas.
- **Dedupe por `b=`/`Message-ID` não foi feito** (pede coluna e índice): pendência 11 passou a MÉDIO e registra o que ficou.
- **Resta e está em `SECURITY.md` (pendência 10):** nenhum contador fecha o download e o DKIM para quem só produz as seis
  recusas, e um DNS lento até o prazo de 15 s ainda estoura em `unverifiable` e repete a entrega.

### Não rodou

DNS, MX, Resend e qualquer envio ou recebimento real; o painel; a API (contratos, `db:test`, `make migration-test` e
`db:generate` — nenhum arquivo da API ou da migration mudou); push; staging e produção. Nada leu banco de produção.

## Ajuste final do teto de partes (T4.7d, conferência de segurança, 2026-10-07)

A conferência final do `opus` (risco BAIXO, sem defeito crítico, alto ou médio) mediu que 200 linhas de fronteira
recusavam, além do ataque, um relatório colado em texto com régua (`-----`) com PDF anexado (0 anexos), e que o custo
do PostalMime é de ~3 ms (200 partes), ~28 ms (1000) e ~100 ms (2000, quadrático). `MIME_PART_LIMITS.maxBoundaryLines`
passou de 200 para **1000**; contar só as linhas que casam o `boundary` declarado foi descartado de propósito (o
PostalMime aceita `boundary*0=` RFC 2231 e `boundary=""`, e uma regex que não enxergasse a fronteira reabriria a falha).
Contrato novo: "300 réguas `-----` + PDF anexado ⇒ 1 anexo". O pior caso que passa foi medido em ~500–650 ms (não
370 ms): `worker_thread` com prazo fica como passo seguinte, não agora (o trecho só roda depois de a thread casar pelo
token de resposta e não cresce com o tamanho da mensagem).

## T2.6 — a cidade do grupo é onde a carga será entregue (2026-10-07)

Branch `work/237-t26` (de `origin/staging`), sem push. Commits: `602201f04` (contrato vermelho), `e4fc26197`
(implementação), mais o commit de docs. Decisão do usuário (2026-10-06, M6): o grupo `(rota, cidade)` usa o destino
físico da nota (`resolvePhysicalDestination`, spec 073), não o `<enderDest>`.

### O que mudou

- `cargo-arrival-destination.query.ts` (novo): `selectArrivalDestinationCities` traz, numa consulta em lote filtrada
  pela empresa, as linhas `delivery`/`recipient` de `nfe_participants` ⋈ `nfe_addresses` (ordem `created_at, id`) e
  escolhe por `pickPhysicalDestinationByDocument` — a política compartilhada, sem precedência reimplementada.
- Leitores trocados: o detalhe da chegada (código **e** nome, lidos de agora — o `city_ibge_code` gravado deixou de
  decidir o grupo), a lista de notas disponíveis (código, nome, UF) e o registro (grava o código físico).
  `selectArrivalCandidateRows` deixou de trazer a cidade do destinatário (nenhum consumidor a usava além do registro).
- **Forma da resposta intacta:** conjunto exato de chaves de grupo (4), documento (12) e nota disponível (10) afirmado
  em integração; `toDocumentView` continua campo a campo.

### Prova

| Camada                                                                 | Antes (vermelho)                                        | Depois                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `cargo-arrival-physical-destination.integration.ts` (Postgres próprio) | 1 pass / 5 fail (pelo motivo certo: cidade do cadastro) | 6 pass / 0 fail                                  |
| 17 outros `cargo-arrival*`/`cargo-preview*.integration.ts`, um por vez | —                                                       | todos verdes (`cargo-arrival` 6, `-return` 8, …) |
| contratos da API (`bun test`)                                          | —                                                       | 10493 pass / 25 skip / 0 fail                    |

Casos do contrato: `<entrega>` em Guarulhos × `<enderDest>` em São Carlos → grupo de Guarulhos (nome `Guarulhos`);
sem `<entrega>` → `<enderDest>`; `<entrega>` sem CEP de 8 dígitos (inutilizável para a política) → `<enderDest>`; nota
sem endereço algum → grupo sem cidade (`null`/`null`, por último); mesma rota em duas cidades físicas → dois grupos
(e a nota com `<entrega>` na mesma cidade de outra se junta a ela); a leitura segue o destino de agora (`<entrega>`
inserido depois do registro move a nota; o código gravado fica em São Carlos); dados de outra empresa não entram.

### Mutações (cada arquivo restaurado por `checkout`; `diff --quiet` = 0 depois de cada uma)

| #   | Mutação                                                 | Resultado                                                         |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| M1  | ignorar `<entrega>` (só o papel `recipient` na escolha) | vermelho — 1 pass / 5 fail                                        |
| M2  | o detalhe volta a ler o `city_ibge_code` gravado        | vermelho — 5 pass / 1 fail ("a leitura segue o destino de agora") |
| M3  | o registro grava `null` em vez do código físico         | vermelho — 4 pass / 2 fail                                        |
| M4  | o mapeador do documento ganha uma chave (`state`)       | vermelho — 5 pass / 1 fail (chaves exatas)                        |
| M5  | a lista de disponíveis perde `state`                    | vermelho — 5 pass / 1 fail                                        |
| M6  | a consulta sem o filtro `company_id`                    | **verde (6 pass)** — ver abaixo                                   |
| M7  | a lista de disponíveis não aplica a cidade física       | vermelho — 5 pass / 1 fail                                        |

⚠️ **M6 não é pegável por teste de comportamento:** `nfe_participants` tem FK composta `(company_id, document_id)`,
então uma linha de outra empresa nunca carrega o `document_id` de uma nota nossa. O filtro é defesa em profundidade
(`company_id` na própria consulta, regra do `CLAUDE.md` da raiz), mantido por convenção e revisão, não por este contrato.

### Decisões que divergiram do pedido

- **Desvio manual não entra no grupo.** O pedido listava "desvio manual → `<entrega>` → `<enderDest>`" e um caso de
  teste "o desvio vence". Mas `resolvePhysicalDestination` não tem o desvio (só `delivery`/`recipient`) e
  `delivery_address_overrides` é histórico de `trip_documents` — o vínculo da viagem, que **só nasce depois** da
  chegada (a nota em viagem viva é recusada no registro). Não há desvio a vencer na hora de separar. Se o produto
  quiser o desvio na chegada, é spec nova: ele só guarda código IBGE (sem nome nem UF) e nasce por vínculo, não por nota.
- **A lista de disponíveis também mudou** (código, nome e UF): é a cidade que a nota levará ao grupo; mostrar o
  cadastro ali e o destino físico no grupo faria a mesma nota parecer estar em duas cidades.
- **Leitura de agora, não o gravado:** conserta também as chegadas já abertas (sem migration, sem backfill) e acompanha
  a correção de endereço (spec 057). Custo: uma consulta a mais por leitura do detalhe (em lote, nunca por nota).
- `toIbgeCityCode` agora vale nos três leitores (código fora do formato IBGE vira ausência); antes só o registro e o
  rascunho o aplicavam.

### Relatado, não alterado

- **Rascunho de viagem da prévia** (`cargo-preview-trip-draft.query.ts`, `cityIbgeCode`/`cityName`/`state` do
  destinatário em `buildTripDraftCities`) segue pela cidade do destinatário: não é "cidade do grupo de separação da
  chegada", e a linha ainda sem XML casa a cidade por **nome normalizado da planilha**. Efeito: o rascunho pode listar
  "São Paulo" enquanto a chegada separa em "Guarulhos" para a mesma nota. Decisão de produto pendente.
- **Vínculo prévia↔nota** (`match_group_key`, CEP/nome do destinatário da planilha) e `cargo-preview-item.query.ts`
  não leem cidade de destinatário — intactos.
- **Painel:** só consome `groups[].cityIbgeCode` e `documents[].cityName` (guardas de chave exata em
  `cargoArrivalGuards.validation.ts`); não calcula o grupo localmente. Nada mudou lá.

### Gates

`bun run typecheck` e `bun run lint` (`--max-warnings=0`) na API: 0 erros. Contratos: 10493 pass / 25 skip / 0 fail.
Integração: Postgres 18 nativo descartável próprio (`127.0.0.1:55937`, fora do Docker), um arquivo por vez.

### Não rodou

Push e deploy; `make check` completo (build do painel, smoke); `make migration-test` (não há migration); a integração
inteira da API (só os 18 arquivos de chegada e prévia, um por vez); o painel (nada tocado); nenhuma leitura de staging
nem de produção.

## T4.8 — a retenção de 90 dias dos dados da planilha (2026-10-07)

Decisão do usuário (2026-10-06): 90 dias depois de a prévia ficar sem item em aberto, o arquivo e o dado pessoal dos
itens saem. A migration (vocabulário de quatro CHECK e a linha do relógio) foi aprovada pelo usuário **só para
staging**. Desenho, o que fica e as pendências: `docs/SECURITY.md` (2026-10-07), ADR-0094 §11, `docs/ai-context/
worker-transportada.md` § "A retenção de 90 dias dos dados da planilha".

### O que existe

- `apps/worker-transportada/src/cargo-preview-retention/`: política do corte (`resolveCargoPreviewRetentionCutoff`,
  relógio injetado), unidade por prévia com porta de gateway (`applyCargoPreviewRetentionUnit` e
  `settleCargoPreviewRetentionUnit`), rotina `cargo-preview.retention.apply`, consulta de elegibilidade única e
  gateway/repositório Drizzle. Registrada em `main.ts`.
- `CARGO_PREVIEW_RETENTION_DAYS = 90` e `CARGO_PREVIEW_OPEN_ITEM_STATES` em `shared/cargo-preview.constant.ts`,
  byte a byte nas duas apps; `retention_applied` entre os eventos da trilha (e entre os da prévia inteira).
- Catálogo de jobs com a entrada nas quatro cópias (API, worker, cron e painel; uma entrada, sem tela).
- Migration `20261007133324_cargo_preview_retention` (gerada por `db:generate`; `db:generate` seguinte =
  `no_changes`).

### Decisões que divergiram do texto do pedido

1. **Instante de referência:** `greatest(prévia.updated_at, max(itens.updated_at))`. Não há "fechado em" por item; o
   `updated_at` do item se move com decisão, desvínculo e reavaliação (conferido no escritor), e a reavaliação só lê
   itens em aberto — prévia sem item aberto não é reescrita. O `updated_at` da prévia entra como piso para a prévia
   sem itens.
2. **Prévia `failed` também entra** (o texto falava só de "sem item em aberto"): ela não tem item e o arquivo com a
   planilha segue no bucket; `queued`/`processing` nunca entram.
3. **`match_evidence` e `row_error` não são anulados:** conferidos nos escritores (`cargo-preview-match.store.ts`,
   `cargo-preview-row.parser.ts`), carregam ids de nota, rótulos fixos de evidência, nome de coluna e mensagem fixa —
   sem dado pessoal. `city`, `state`, `recipient_code`, `contractor_reference` e `file_name` ficam (pendência,
   `docs/SECURITY.md`).
4. **Trava do contratante** (não pedida): a unidade toma `pg_try_advisory_xact_lock` da chave do vínculo, sem esperar,
   para não anular a prévia que o operador está reabrindo.
5. **Item de objeto sem `skip locked`:** objeto pulado por lock pareceria "já apagado" e a prévia fecharia com bytes no
   bucket.

### Passes antes e depois

| Suíte                                               | Antes                                  | Depois                                                                                                                      |
| --------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Contratos da retenção (política, unidade, ciclo)    | 5 pass, 17 fail (valor errado do stub) | 23 pass, 0 fail                                                                                                             |
| Integração da retenção (Postgres próprio, 14 casos) | 2 pass, 11 fail (stub devolvendo zero) | 14 pass, 0 fail                                                                                                             |
| `bun run test` do worker                            | —                                      | 2014 pass, 0 fail                                                                                                           |
| `test:integration` do worker (uma vez, completo)    | —                                      | 212 pass, 15 skip, 1 fail (o flaky `contractor-mail-inbound-outbox`; `osrm`, RabbitMQ e SIGTERM pulados por falta de infra) |
| `bun run test` do cron                              | —                                      | 101 pass, 0 fail                                                                                                            |
| Contrato do catálogo do painel                      | —                                      | 6 pass, 0 fail                                                                                                              |
| `bun run test` da API                               | —                                      | 10485 pass, 34 skip, **4 fail** — todos da migration (ver "Pendente")                                                       |

Banco de integração: Postgres 18 nativo descartável próprio (`127.0.0.1:56481/transportada_t48`), não o
`transportada_worker_integration`; bucket em memória no teste. `typecheck` e `lint` limpos em worker, API e cron.

### Mutações (todas vermelhas, restauradas com `git checkout`)

| #   | Mutação                                            | Resultado                                                                                                                                                            |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | sem a guarda de item em aberto                     | morta: "prévia com item em aberto NUNCA é tocada"                                                                                                                    |
| M2  | prazo de 89 dias                                   | morta: 5 testes (constante, corte, 90/89 dias)                                                                                                                       |
| M3  | anonimiza `city` além das quatro                   | morta: "preserva o resto"                                                                                                                                            |
| M4  | apaga a linha de `stored_objects` em vez de marcar | morta: 12 testes                                                                                                                                                     |
| M5  | sem o anti-join do evento (reprocessa)             | morta: 9 testes                                                                                                                                                      |
| M6  | erro imprevisto de uma prévia derruba o lote       | morta: `settleCargoPreviewRetentionUnit` (a primeira versão da mutação, sobre o repositório, sobreviveu: o isolamento foi movido para a aplicação e ganhou contrato) |
| M7  | marca retida mesmo com falha de bucket             | morta: contrato da unidade e integração                                                                                                                              |
| M8  | sem teto de objetos por prévia                     | morta: contrato e integração                                                                                                                                         |
| M9  | sem a trava do contratante                         | morta: "com o operador na prévia…"                                                                                                                                   |

### Pendente (precisa da mão do usuário ou de quem tem a permissão)

O `migration.sql` gerado por `db:generate` ficou **sem a edição à mão**: as CHECK não entram `NOT VALID` +
`VALIDATE`, falta o `INSERT INTO "job_schedules"` da rotina e **não existe `rollback.sql`**. A permissão do
ambiente negou a escrita nesses arquivos. O contrato estático (`cargo-preview-retention.static.contract.ts`) e o do
catálogo da API ("accepts every interval the migration already seeded") ficam **vermelhos de propósito** até a
edição; são os quatro testes que reprovam na API.

### Não rodou

Push, staging e produção; `make migration-test` e `db:test` (a pasta da migration não está completa); leitura de
qualquer banco de produção; DNS, MX, Resend e e-mail real; MinIO real (dublê em memória).
