# Spec 155 — Plano

> 🤖 Modelo: `opus` 🧠 na fase 1 · `sonnet` nas fases 2 e 3 · `haiku` na fase 4

Base: worktree próprio (`make worktree NAME=box-variants`) sobre `origin/staging`. Contrato antes do
código em toda fase. Nenhum arquivo de entrypoint de teste precisa nascer: os contratos da API
entram em `test/nfe-package-box/` (já importado por `test/nfe-package-box.contract.test.ts`, que já
está no `package.json`) e os do frontend em `test/nfe-workspace/`.

## Fase 1 — A regra de família, isolada e testada (🧠 `opus`)

Onde: `apps/api-transportada/src/nfe-documents/domain/package-box-family.policy.ts` (novo).

Função pura, sem banco: `resolveBoxFamily({ description, commercialUnit })` → `{ prefix,
variantLabel, familyKey }`, pela D2. Mais `resolvePackagingUnitCount(commercialUnit)` → o sufixo
numérico da unidade (`CX36` → 36, `UN1` → 1, sem sufixo → `undefined`), que alimenta o badge da D8 e
a recusa da D3.

A regex é gulosa de propósito (`^.*[0-9][^ ]*`) — ela tem de parar no **último** token com dígito, e
é isso que separa `AMAC CONC DOWNY 500ML | BRISA SUAVE` de `AMAC CONC DOWNY | 500ML BRISA SUAVE`.
Casos de borda que o contrato tem de fixar: descrição sem dígito nenhum; dígito no primeiro token;
descrição só de número; espaços duplos; `L500 P350ML` (dois tokens com número, vence o último);
`ALCOOL FLOPS 1L 46.2` (o `46.2` é o último token com dígito e vira parte do prefixo — família de 1,
aceito).

É a fase cara porque é a única decisão irreversível: prefixo errado agrupa caixa que não é a mesma, e
a D5 é a rede, não a prevenção.

## Fase 2 — API: contar a família, listar as irmãs, replicar (`sonnet`)

1. **Schema e migration.** `apps/api-transportada/src/database/nfe.schema.ts` (e a cópia por valor em
   `apps/worker-transportada/src/database/nfe.schema.ts`, que tem de andar junto): `'replicated'`
   entra em `PACKAGE_BOX_MEASUREMENT_SOURCES`, nos dois checks de `measurement_source` e nos dois de
   pareamento de margem (`replicated` também não carrega margem). `nfe_package_box_measurements`
   ganha `replicated_from_box_id uuid` nullable com FK composta
   `(company_id, replicated_from_box_id)` → `nfe_package_boxes_company_id_id_unique`, e um check de
   que ele só vem preenchido quando `source = 'replicated'`. Migration aditiva em
   `apps/api-transportada/drizzle/<timestamp>_package_box_replicated_source/`; `make migration-test`
   cobre o rollback.

2. **Listagem.** `infrastructure/drizzle-package-box.repository.ts` → o `list` hoje ordena por
   `coalesce(volumes,0) desc` e corta em `LIMIT`. Os contadores da D9 precisam sair de **todas** as
   caixas da empresa, não da janela — mas calculá-los numa CTE exigiria reescrever a regex da fase 1
   em SQL, e as duas linguagens divergem de fato (`\s` POSIX sem NBSP, `.` casando `\n` no Postgres,
   `upper()` por collation). Então o repositório carrega `(id, description, commercialUnit,
measuredAt)` da empresa inteira — 663 linhas de texto curto em produção — e conta em TypeScript
   com `resolveBoxFamily`. Uma implementação da regra, nenhum contrato de paridade para manter.
   `application/package-box.port.ts` e `domain/package-box-queue.policy.ts` (`buildMeasurementQueue`)
   propagam os campos novos até o `PackageBoxView`.

3. **Irmãs.** `application/list-package-box-siblings.use-case.ts` + `GET
/nfe-package-boxes/:id/siblings`, `cargo.measure` / `company` como as demais. Resposta
   `{ data: { family: [...], packaging: [...] } }`, cada item com `id`, `variantLabel`,
   `commercialUnit`, `packagingUnitCount`, `measuredAt`, dimensões. As duas listas vêm separadas
   porque só a primeira é alvo de replicação (D3).

4. **Replicar.** `application/replicate-package-box-measurement.use-case.ts` + `POST
/nfe-package-boxes/:id/replicate`, body `{ targetIds: string[] }` (`.strict()`, 1..200 UUIDs
   únicos). Uma transação: lê a origem, recusa origem sem medida (422), recusa alvo de outra empresa
   (404), fora da família (422) e já medido (409, D4); grava dimensões + peso + `units_per_box` +
   `measurement_source = 'replicated'` + `measured_at`, e uma linha de histórico por alvo com
   `replicated_from_box_id` (D6). Devolve `{ data: { replicatedCount } }`.
   Erros de domínio em `domain/package-box-measurement.error.ts`, ao lado do
   `PackageBoxCameraMeasurementDisabledError` que já mora lá.

5. **Composition root.** `apps/api-transportada/src/main.ts`: os dois use cases novos entram no
   `createPackageBoxRoutes({ ... })` já registrado (hoje `cameraMeasurementSettings`,
   `listPackageBoxes`, `measurePackageBox`).

6. **Regressão da G007.** Contrato que reimporta NF-e de produto medido e prova que dimensão,
   `measured_at`, `units_per_box` e `measurement_source` não mudam. É a garantia que o operador pediu
   por escrito; hoje ela é verdade por construção e não tem teste com esse nome.

## Fase 3 — Tela: a unidade visível, o botão rápido, o diálogo de replicar (`sonnet`)

Onde: `apps/frontend-transportada/src/modules/nfe-workspace/`.

- `shared/packageBoxClient.service.ts`: campos novos em `PackageBox`, `listSiblings`, `replicate`,
  guards de resposta.
- `hooks/usePackageBoxQueue.hook.ts`: mutação `replicate` invalidando `['nfe-package-boxes']`, e
  `siblings` carregado sob demanda (não junto da lista — a fila abre com 50 linhas).
- `components/PackageBoxMeasurementPanel.component.tsx`: badge de unidade com contagem em toda linha
  (D8, G008); linhas do mesmo `packagingGroupId` agrupadas sob o produto; contador de família.
- `components/PackageBoxMeasurementForm.component.tsx`: “usar a medida de {rótulo}” preenchendo os
  campos sem gravar (D7, G009).
- Diálogo de replicar depois do salvar, lista pré-marcada com o rótulo de cada variação (D5, G010).
  Reaproveita o padrão de confirmação do `ImpreciseConfirmDialog` que já existe no formulário.

## Fase 4 — Locales e documentação (`haiku`)

`locales/nfeWorkspace.locale.json` e `nfeWorkspace.en.locale.json` sob `packageBoxes.*`. Atualizar o
comentário de `nfe_package_boxes` no schema (a identidade agora tem leitura em dois eixos) e o
`docs/ai-context/` da API e do frontend. Registrar a D10 como pendência em
`specs/PERGUNTAS-ABERTAS.md` — ela precisa de spec própria e não pode sumir no histórico do chat.

## O que este plano deliberadamente não faz

Não mexe em `carton_gtin` (D10), não abre campo de peso nem de empilhamento no formulário, não
pagina a fila e não apaga linha nenhuma de `nfe_package_boxes`.
