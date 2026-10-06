# Evidência — 245

## T1.1 — fonte do pacote × tarball 0.7.0

- Repositório de pacotes: `origin/main` = `15e0a029c5aba85346ab5c6225bbe6a9081886ae`. O checkout principal
  (branch `feat/whatsapp-preview-de-link`, árvore suja de outra sessão) **não foi usado**; a Fase 1 roda
  em `git worktree add` a partir de `origin/main`.
- Resultado: fonte do módulo em `origin/main` == tarball `0.7.0` — 37/37 arquivos do sourcemap, 11/11
  migrations, 73/73 exports. Sem divergência.
- Desvio fora do módulo (não bloqueia): o #125 (`15e0a02`) mudou
  `meta-whatsapp-contracts/src/providers.ts` (`SendTextOptions`) sem changeset; os contratos em
  `origin/main` estão à frente do `0.6.0` publicado; o módulo não os usa.
- Parecer do `architect` (opus) aprovado; 14 correções aplicadas a `spec.md`, `plan.md` e `tasks.md`.

## Fase 1 — pacote (worktree `adatechnology-packages-wt/s245-redact-location`, branch `feat/meta-whatsapp-redact-inbound-location`, PR rascunho #126)

Postgres 18.4 nativo descartável (porta 58245, derrubado ao fim); `DRIZZLE_TEST_DATABASE_URL` definida em
toda execução citada abaixo. `pnpm install --frozen-lockfile` e `pnpm run build:all` antes dos testes.

### T1.2 — vermelho (`f48262b`)

`ReceiveWebhook.locationRedaction.test.ts` + `createMetaWhatsAppModule.redactInboundLocation.integration.test.ts`
(com a constante `inboundLocation.constant.ts` já criada, para o vermelho ser de comportamento):

```text
(fail) createMetaWhatsAppModule - features.redactInboundLocation > ligada: a linha gravada nao tem a coordenada nem o rotulo
(fail) redactInboundLocation ligada > grava a linha sem payload.location e sem o rotulo, mantendo type location
(fail) redactInboundLocation ligada > so location sai: outra chave do payload fica
(fail) extractContent > com isLocationRedacted devolve a constante, sem rotulo
 5 pass
 4 fail
```

Antes disso, o primeiro vermelho foi `Cannot find module '../inboundLocation.constant'`.

### T1.3 — opção e ligação (`cdfd44d`)

Verde: `12 pass / 0 fail` (3 arquivos: locationRedaction, location existente, ligação).

| Mutação                                                  | Resultado                               |
| -------------------------------------------------------- | --------------------------------------- |
| caso de uso ignora a opção (`isLocationRedacted: false`) | 3 fail (ligada x2, ligação), 9 pass     |
| fábrica ignora a opção (`redactInboundLocation: false`)  | 1 fail (só o teste de ligação), 11 pass |
| restaurado                                               | 12 pass / 0 fail                        |

### T1.4 — integração antes (`f943432`), caso de uso depois (`ff12a47`)

Vermelho: `Cannot find module '../use-cases/RedactInboundLocations.use-case'`. Primeira versão do SQL
(`UPDATE ... WHERE id IN (subconsulta LIMIT FOR UPDATE)`) falhou: `lote de 1` redigiu 2 (o planejador
reexecuta a subconsulta); trocada pela CTE (`$with` do drizzle + `UPDATE ... FROM batch`), como no parecer.

**A integração RODOU**: `8 pass / 0 fail / 26 expect() calls`, sem skip (suíte inteira do módulo com
`DATABASE_URL`: `212 pass / 0 fail`; sem banco: `193 pass / 27 skip`, que é o que se evita aceitar).

| Mutação                                 | Resultado                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| sem `created_at <`                      | 2 fail                                                                                                                            |
| `payload - 'location'` trocado por NULL | 1 fail (`referredProduct` some)                                                                                                   |
| sem `NULLIF`                            | 2 fail (`payload` vira `{}`)                                                                                                      |
| sem `direction`                         | 2 fail (a saída cai)                                                                                                              |
| sem `company_id` nos dois lugares       | 3 fail (B cai)                                                                                                                    |
| sem `company_id` só na subconsulta      | 0 fail: **mutante equivalente**, o `company_id` repetido fora da subconsulta barra B (defesa em profundidade prevista no parecer) |

### T1.5 — changeset e gates (`060085c`)

`.changeset/meta-whatsapp-redact-inbound-location.md` (`minor`, só o módulo). Gates (comandos da CI):
`pnpm run build:all` exit 0; typecheck da CI (`-r --if-present run check` com os três filtros) sem erro;
`pnpm -F @adatechnology/meta-whatsapp-module test`: com `DATABASE_URL` `212 pass / 0 fail`, sem
`193 pass / 27 skip / 0 fail`; eslint dos arquivos tocados limpo (o único aviso do módulo,
`src/testing/mediaSamples.ts`, é anterior). Branch publicada; PR rascunho
https://github.com/Andersonfrfilho/adatechnology-packages/pull/126 (não mesclado). **Não publicado no npm.**

Divergências do parecer: (1) o SQL usa o construtor do drizzle (`$with`/`update().from()`), não SQL cru,
porque o módulo é agnóstico de driver; (2) a constante vive em `src/inboundLocation.constant.ts`;
(3) o teste de ligação ficou na integração (precisa do banco), não no unitário.
