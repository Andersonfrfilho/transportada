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
