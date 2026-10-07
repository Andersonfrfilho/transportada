# Plano — 245

## Dois repositórios, uma ordem

| Repositório                                                                             | O que muda                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `~/Documents/personal/adatechnology-packages` (`packages/backend/meta-whatsapp-module`) | opção `features.redactInboundLocation`, caso de uso `redactInboundLocations`, constante do rótulo, testes, changeset `minor` |
| este monorepo (`apps/api-transportada`)                                                 | bump do pacote, opção ligada no resolver, script de redação do legado, integração estendida                                  |
| este monorepo (`apps/frontend-transportada`)                                            | uma linha de texto do painel da 239 (pt-BR e `en`)                                                                           |
| docs                                                                                    | `docs/SECURITY.md`, ADR-0081 (emenda), `apps/api-transportada/CLAUDE.md` § WhatsApp, `docs/ai-context/api-transportada.md`   |

O worker **não** muda (D3).

## Pacote

1. **Worktree a partir de `origin/main`.** O checkout principal do repositório de pacotes tem branch de
   feature e árvore suja de outra sessão: **não usar**. `git fetch` e
   `git worktree add ../adatechnology-packages-wt/<nome> -b <branch> origin/main`. T1.1 conferiu fonte ==
   tarball `0.7.0` (37/37 arquivos, 11/11 migrations, 73/73 exports; `extractContent` `:64-78`,
   `extractPayload` `:80-92`).
2. **Constante** `INBOUND_LOCATION_CONTENT = '📍 Localização'` (a string já existe em `extractContent`); usada
   pelo ingest com a opção ligada e pelo caso de uso de redação.
3. **Opção** em `MetaWhatsAppModuleFeatures` (`createMetaWhatsAppModule.ts:72-95`):
   `redactInboundLocation?: boolean`, comentário de uma linha com o porquê (minimização; padrão `false` por
   compatibilidade). Passa ao `ReceiveWebhookUseCase` por parâmetro; `extractContent`/`extractPayload`
   recebem a decisão (função pura, parâmetro único em objeto se passar de um).
4. **Caso de uso** `RedactInboundLocationsUseCase` (`use-cases/RedactInboundLocations.use-case.ts`), com
   `MessageRepository.redactInboundLocations({ companyId, receivedBefore: Date, batchSize? })` executando o
   SQL do D2 (CTE com `FOR UPDATE SKIP LOCKED`, sem `ORDER BY`, guard `jsonb_typeof`, `NULLIF`, `content`
   só quando `type = 'location'`). Mais `countInboundLocations` → `{ counted, unreachable }`. Expostos em
   `conversations.redactInboundLocations`/`countInboundLocations`, ao lado de `purgeExpiredDocuments`
   (`createMetaWhatsAppModule.ts:350`); `index.ts` exporta os casos de uso e `INBOUND_LOCATION_CONTENT`.
5. **Testes** (padrão do pacote: `*.test.ts` e `*.integration.test.ts` ao lado da fonte):
   - `ReceiveWebhook.location.test.ts` (existe) ganha os casos com a opção ligada/desligada (CA1).
   - `MessageRepository.redactInboundLocations.integration.test.ts` (novo; padrão `*.integration.test.ts`), no molde de
     `MessageRepository.deliveryError.integration.test.ts`, contra Postgres descartável com as migrations
     do pacote (CA2).
6. **Changeset** `minor` para `@adatechnology/meta-whatsapp-module`; os contratos e o provider não mudam.
7. **Publicação:** pelo fluxo do repositório de pacotes. **Parar e perguntar ao usuário antes.** Depois,
   conferir pelo tarball no npm (não pelo status do workflow, que cai em 404 por propagação).

## API

1. Bump de `@adatechnology/meta-whatsapp-module` para a versão nova em `apps/api-transportada/package.json`;
   `bun install`; `bun install --frozen-lockfile` verde. Conferir que nenhuma migration nova veio no
   pacote (`dist/migrations/` com as mesmas 11 pastas; `test/whatsapp/module-migration.contract.ts` segue
   verde).
2. `meta-whatsapp-module.resolver.ts:92`: `features: { redactInboundLocation: true }` em
   `createMetaWhatsAppModule`. Constante nomeada no `*.constant.ts` do módulo `whatsapp` se o valor se
   repetir (não deve).
3. `test/integration/whatsapp-driver-flow-actions.integration.ts`: depois do webhook com localização,
   ler `meta_whatsapp.messages` da empresa do teste e afirmar `payload ? 'location'` falso e `content`
   igual ao rótulo sem nome (CA3). A asserção vem **antes** do bump (teste vermelho com a `0.7.0`).
4. `scripts/whatsapp-location-redact.ts`: argumentos validados com Zod; abre o banco pela config validada
   do script de publicação de fluxo; chama `conversations.redactInboundLocations` em laço até `redacted =
0` (com `--confirm`) ou `countInboundLocations` (sem `--confirm`) — a contagem vem do pacote. Log `whatsapp.location.redacted` com `companyId` e totais. Contrato em
   `test/whatsapp/location-redact-script.contract.ts`, entrada na lista explícita do `package.json`.
   ⚠️ Para o script não precisar de token da Meta para construir o módulo, instanciar só o
   `MessageRepository` (já exportado, `src/index.ts:103`) e o caso de uso novo, que a T1.4 exporta do
   `index.ts` ao lado dele.

## Painel

`apps/frontend-transportada/src/modules/trip/locales/trip.locale.json:1081` e
`trip.en.locale.json:1081`, chave `whatsapp`, texto do D5. O contrato do painel da 239 que fixa os textos
(se houver) é atualizado junto; sem mudança de componente.

## Docs

- `docs/SECURITY.md`: o item "Coordenada do transcript do WhatsApp" (`:2118-2120`) vira resolvido (data,
  versão do pacote, contagem redigida por ambiente); entrada nova **aberta**: "retenção do transcript do
  WhatsApp inteiro (texto, telefone, código B1)", sem decisão.
- ADR-0081: emenda 7.2 curta (o transcript não guarda o ponto; o legado foi redigido).
- `apps/api-transportada/CLAUDE.md` § WhatsApp: uma linha sobre a opção e o script.
- `docs/ai-context/api-transportada.md`: seção da spec 245.

## Ordem de deploy

1. Pacote publicado e conferido no npm (parada humana).
2. API em staging com o bump e a opção (push; gates verdes). O worker e o painel não dependem disso.
3. Verificação em staging: uma localização de teste chega ao evento (`captured`) e a linha do transcript
   sai sem ponto — consulta só de `payload ? 'location'` e `content`, nunca dos valores.
4. Redação do legado em staging: dry-run (contagem) → `--confirm` (parada humana).
5. Produção: o mesmo, com aprovação humana em cada passo (deploy e redação). O `receivedBefore` de cada
   ambiente é o instante do deploy daquele ambiente.
6. Painel (texto do D5) junto com o deploy da API de cada ambiente, ou depois — nunca antes, para a tela
   não afirmar o que o ambiente ainda não faz.

Rollback: reverter o bump. Mensagens novas voltam a gravar o ponto; nada redigido volta. Sem migration,
nada a desfazer no banco.

## Gates por task

`bun run typecheck` na raiz, lint da app como cwd, testes da app pelo script `test`; integração da API com
`bun --env-file=../../.env.test run test:integration` (o arquivo tocado com `./test/integration/...`);
no pacote, os scripts de teste do repositório de pacotes; commit isolado (`git add` explícito,
`--no-verify`); `bunx prettier --check` nos `.md` tocados.
