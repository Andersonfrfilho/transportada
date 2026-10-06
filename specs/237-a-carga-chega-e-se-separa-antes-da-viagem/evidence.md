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
