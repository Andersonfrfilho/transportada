# 071 — Evidência

Todos os números abaixo saíram dos comandos citados, nesta branch (`work/spec-071`), com a infra
local de pé (`make up`). Onde um teste passou de primeira, ele foi **quebrado de propósito** para
provar que consegue falhar; a linha "falsificação" registra o que quebrou e o vermelho que saiu.

## Modelo usado

⚠️ A `tasks.md` recomenda `opus` para a fase 0 e `sonnet` para as fases 1 a 3. A sessão inteira
correu em **`opus`**, porque o pedido do usuário foi executar a spec inteira de uma vez e trocar de
modelo no meio de uma sessão não é possível sem interrompê-la. A divergência é de custo, não de
risco: `opus` é o modelo mais caro dos dois, e os gates da §3 do `model-economy.md` (typecheck, lint,
suíte completa, commit isolado por task) rodaram em todas as fases.

## Fase 0 — O pacote

Repositório `adatechnology-packages`, branch `work/spec-071-document-intake`, worktree
`~/Documents/personal/adatechnology-packages-wt/spec-071`.

| Task | Evidência                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T001 | `docs/adr/0054-o-parser-do-documento-vira-biblioteca.md` — pacote, não cópia por valor, e a linha que separa o que é do documento do que é do catálogo do app |
| T002 | `readCrlv` em `packages/frontend/document-intake/src/crlv.service.ts`, devolvendo `CrlvValues` (campos impressos) e **não** `FleetVehicleFormState`           |
| T003 | `extractCnhFields` (`src/cnh.service.ts`) e `createTesseractOcrClient` + `readsWithOcr` (`src/tesseractOcr.client.ts`)                                        |
| T004 | `0.1.0-rc.4` versionada por changeset; as quatro apps apontam para ela (o painel estava em `rc.2`)                                                            |
| T005 | `crlvVehicle.service.ts` do painel virou mapeador de catálogo; a leitura vem do pacote                                                                        |

```
bun test        # em packages/frontend/document-intake
 60 pass   0 fail          (era 41 pass antes da spec)
bun run check   # tsc --noEmit — sem saída
bun run build   # dist/index.js 15.82 KB, com readCrlv, extractCnhFields, createTesseractOcrClient
```

**Falsificação (T002).** Trocadas duas expectativas centrais — `bodyType` esperando `'02'` em vez de
`'FURGAO'` (isto é, o pacote traduzindo para catálogo, que é o que a ADR proíbe) e `municipality`
esperando ausência: `8 pass, 2 fail`, com `Received: "FURGAO"` e `Received: "SAO PAULO"`. Desfeito,
`10 pass`.

**Falsificação (T003).** As duas asserções `rejects.toThrow` eram candidatas a falso positivo (sem
`await`). Trocadas por strings que o erro não contém, mais o registro da CNH esperando o CPF:
`6 pass, 3 fail` — as três falham, então elas mordem. Desfeito, `9 pass`.

⚠️ **`rc.4` não foi publicada** — o pedido foi parar antes de publicar, e publicar no npm é
publicar. Para as apps compilarem e os testes rodarem agora, a versão construída foi instalada
localmente em `apps/*/node_modules`. Consequência medida: `make worker-integration` e qualquer alvo
que passe por `bootstrap` falham em `bun install --frozen-lockfile` com
`No version matching "0.1.0-rc.4" found` — é a dependência de release que a própria spec previu.

## Fase 1 — O CRLV preenche o que ele diz

| Task | Evidência                                                                                     |
| ---- | --------------------------------------------------------------------------------------------- |
| T006 | Campo "CRLV do veículo" na landing; lê local por `readVehicleDocument` e envia `type: 'crlv'` |
| T007 | `mergeCrlvIntoFields` (`crlv.service.ts`), com o mapa da spec escrito como dado (`FILLED_BY`) |
| T008 | `test/application/crlv-merge.contract.ts` e o bloco novo em `document-intake.contract.ts`     |

```
bun run --cwd apps/frontend-landing test
 45 pass   0 fail          (parcial, ao fim da fase 1)
```

**Falsificação.** Quatro expectativas invertidas de uma vez — a cidade preenchida virando vazia, o
nome digitado sendo sobrescrito pelo do documento, e o CRLV lido pelo leitor de empresa preenchendo
algo: `41 pass, 4 fail`, exatamente nos quatro contratos que guardam as três guardas. Desfeito,
`45 pass`.

## Fase 2 — Os documentos abrem o formulário

| Task | Evidência                                                                               |
| ---- | --------------------------------------------------------------------------------------- |
| T009 | Bloco "Documentos" é o primeiro; `DOCUMENT_FIELDS` com quatro campos, todos opcionais   |
| T010 | `shouldShowCompanyBlock({readTaxId, typedTaxId})` — o que vier primeiro abre o bloco    |
| T011 | `mergeCcmeiIntoFields` passou a preencher `taxId`; o endereço já preenchia desde a 066  |
| T012 | `test/application/pre-registration-blocks.contract.ts` e `attachment-types.contract.ts` |

```
bun run --cwd apps/frontend-landing test
 104 pass   0 fail         (parcial, ao fim da fase 2)
```

**Falsificação.** "Documentos" movido para segundo no registro e a CNH declarada como leitora de
veículo: `102 pass, 2 fail` — a ordem da tela e o mapa de leitores. Desfeito, `104 pass`.

O contrato de ordem não é tautológico: ele lê a **fonte** do componente, extrai os índices de
`PRE_REGISTRATION_BLOCKS[n]` na ordem em que aparecem no JSX e compara com o registro, e ainda proíbe
que qualquer bloco seja desenhado com o texto solto.

## Fase 3 — Os tipos novos e o OCR da CNH

| Task | Evidência                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T013 | `address_proof` e `company_document` no catálogo, no CHECK (migration `20260901230000_aggregate_attachment_document_types`), no Zod (que importa o catálogo), na cópia do envelope do worker e nos rótulos do painel. `ccmei` **fica** |
| T014 | Campos de CNH e comprovante enviando; `reads: 'none'` nos dois, guardado por contrato                                                                                                                                                  |
| T015 | `document-extraction.gateway.ts` escolhe por assinatura (`document-signature.ts`); `pdf-extraction.worker.ts` deixou de filtrar por tipo e passou a ler CRLV também; `AGGREGATE_DOCUMENT_OCR_URL` no worker                            |
| T016 | `ATTACHMENT_FIELD_LABEL` e `listAttachmentDivergences` cobrem CNH e CRLV; contrato por texto de fonte impede `extractCnhFields` de voltar para a landing                                                                               |
| T017 | `test/fleet/attachment-type-labels.contract.ts` — todo tipo tem rótulo, e nenhum é a chave                                                                                                                                             |

```
bun run --cwd apps/worker-transportada test
 873 pass   0 fail         (era 865)
bun run --cwd apps/frontend-transportada test
 454 pass   0 fail         (suíte fleet; era 448 antes do T016)
```

**Falsificação (T015).** O ramo do PDF desligado (`if (false)`) e o mapa da CNH liberado para
qualquer tipo: `15 pass, 2 fail` — "PDF vai para a camada de texto" e "imagem de outro tipo não vira
campo nenhum". Desfeito, `17 pass`.

**Falsificação (T016/T014).** `extractCnhFields` importado na landing: o contrato por texto de fonte
falha (`106 pass, 1 fail`). Desfeito, `107 pass`.

**Falsificação (T017).** Rótulo de `address_proof` removido do locale: `446 pass, 2 fail`. Desfeito,
`448 pass`.

## Infra de verdade

```
make up                                   # postgres, rabbitmq, minio, mailpit, keycloak — Healthy
make migration-test
 90 pass   0 fail                          # migration + rollback em Postgres descartável
```

⚠️ O `rollback.sql` precisou retrair a **própria linha do journal**, como os vizinhos fazem. Sem
isso o teste de migração reprovava: depois de revertida, a migration continuava listada como
aplicada. Achado real, e só o Postgres de verdade o pegou.

Ponta a ponta, o caminho inteiro depois do `201`, com bucket, broker e `worker_thread` reais
(`test/integration/aggregate-attachment.integration.ts`):

```
bun test ./test/integration/aggregate-attachment.integration.ts   # DATABASE_URL da base provisionada
 2 pass   0 fail
```

O segundo caso é o desta spec: CRLV no MinIO → `aggregate_attachment_outbox` → relay → RabbitMQ →
consumidor → assinatura escolhe a camada de texto → `worker_thread` → `readCrlv` → `extracted_fields`
no Postgres, afirmando `plate`, `ownerName`, `ownerTaxId`, `municipality` e `state`.

**Falsificação.** Placa esperada trocada por `ZZZ0Z00`: `1 pass, 1 fail`, com o diff mostrando os
quatro campos realmente lidos do banco. Desfeito, `2 pass`.

## Gate da raiz

```
bun run format:check && bun run lint && bun run typecheck && bun run test
 3845 pass  0 fail   (api-transportada)
  873 pass  0 fail   (worker-transportada)
   94 pass  0 fail   (cron-transportada)
 2241 pass  0 fail   (frontend-transportada)
   17 pass  0 fail   (frontend-client)
  107 pass  0 fail   (frontend-landing)
```

**7177 testes, zero falhas.** A linha de base desta branch, antes da spec, era 7127.

## O que não fechou, e por quê

**`test/integration/sigterm.integration.ts` falha neste worktree** (`0 pass, 1 fail`, timeout de
40s), e **não é desta spec**. O que foi medido:

1. Revertendo **todo** o `apps/` para o commit base (`git checkout e837a473 -- apps/`), o teste
   continua falhando neste worktree.
2. O mesmo teste, no checkout principal em `staging`, com a mesma carga de máquina, passa
   (`1 pass, 0 fail`).
3. Revertendo só o `main.ts` (a única fiação de worker desta spec), continua falhando.

Ou seja: a causa está no ambiente do worktree, não no código. A suspeita mais forte é o estado de
instalação do pacote não publicado (`package.json` em `rc.4`, `bun.lock` em `rc.3`) — o mesmo motivo
que derruba `make worker-integration` no `bootstrap`. **Reverificar depois de publicar a `rc.4`**, com
`make worker-integration` inteiro. O resto da integração do worker passa: `63 pass, 4 skip` na
mesma execução, com os 4 `skip` sendo os do OSRM, que é opt-in.

Há também um `bun --watch ./src/main.ts` de outra sessão rodando nesta máquina durante as medições.
