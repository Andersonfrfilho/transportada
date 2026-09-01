# Evidências

## Fase 0 — O adendo, antes do código

### T001 ✅ 2026-09-01 — Adendo na ADR-0044 §3

`docs/adr/0044-o-roteiro-se-sugere-sozinho.md` ganhou a linha `Emendada em 2026-09-01` no cabeçalho
(l. 9) e a seção `## Adendo 2026-09-01 — o CEP é o degrau primário, e o provedor pago é escalada`
(l. 218), no mesmo formato do adendo da ADR-0039.

O que o adendo fecha:

- **por que a ordem escrita na §3 não é a implementada** — as duas medições de 2026-09-01 contra a
  BrasilAPI (a coordenada já chega no corpo que `postal-code.gateway.ts` descarta; resolve em cidade
  de onze mil habitantes). Quando a §3 foi escrita, o degrau gratuito era teórico;
- a escada de três degraus, **sem gatilho automático**, e o registro de que a escalada automática por
  colisão foi avaliada e recusada por gastar sem decisão;
- o que da §3 **continua valendo**: armazenamento permanente, `place_id` `not null`, a exceção de
  licença (sobre muito menos linhas), a ordenação da cascata, o pino manual vencendo tudo, e `city`
  fora da otimização;
- a recusa renovada de hospedar geocodificador, com o motivo ao lado da §2 porque contradiz a
  intuição de quem a leu — matriz lida milhares de vezes por sugestão contra geocodificação uma vez
  por endereço novo;
- **o risco novo que a §3 não tinha**: a coordenada do CEP ignora o número, e a marca é a mitigação
  e o instrumento de medida;
- o caso do CEP geral, com o `street` ausente como discriminador em vez do sufixo `-000`;
- onde cada degrau roda, e por que a marca na API não contraria a §7.

**Verificação:** `bunx prettier --check docs/adr/0044-o-roteiro-se-sugere-sozinho.md` → verde.

## Fase A — O fio e o degrau de graça

### T002 ✅ 2026-09-01 — A cascata mudou de app

⚠️ **A task corrigiu o próprio plano.** Ele mandava partir `geocoding-precision.policy.ts` por
consumidor; ao executar, duas medições no código mostraram que isso estava errado:

- `geocodeAddresses` **não chama** `shouldReplaceStored` — a cascata só grava o que está ausente da
  base, nunca substitui. Só o teste as via juntas.
- Com o degrau 2 na API, quem precisa de `toGeocodingPrecision` é o gateway pago, que mora lá.

Partir como estava escrito deixaria o ranking `rooftop > street > postal_code > city` **duplicado nas
duas apps** — a cópia por valor que diverge em silêncio. `plan.md` foi corrigido antes da execução.

O que ficou:

| peça                            | destino                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `geocodeAddresses` (cascata)    | worker — `src/routing/application/geocode-address.use-case.ts` |
| `shouldReplaceStored`           | API — migrou para `domain/geocoding-precision.policy.ts`       |
| `geocoding-precision.policy.ts` | API, inteira                                                   |
| tipos da porta                  | ambas (declaração, não regra)                                  |

`routing.schema.ts` do worker ganhou `source`, `external_place_id` e os três carimbos — ele deixou de
só ler a tabela e passou a escrevê-la. Os dois vocabulários de precisão/origem entraram como **tipo**,
não como catálogo em tempo de execução: quem valida são os CHECKs que a API migra.

Testes separados junto: a cascata foi para `worker/test/routing/geocode-address.contract.ts`, a
precedência para `api/test/routing-domain/stored-precedence.contract.ts`, e os três entrypoints
foram religados.

**Verificação:**

```
bun run --cwd apps/worker-transportada typecheck   → verde
bun run --cwd apps/api-transportada typecheck      → verde
bun run --cwd apps/worker-transportada test        → 821 pass / 0 fail (72 arquivos)
bun run --cwd apps/api-transportada test           → 3818 pass / 23 skip / 0 fail (151 arquivos)
```

### T003 ✅ 2026-09-01 — O repositório do worker, e por que ele não é o da API

`worker/src/routing/infrastructure/drizzle-geocoded-address.repository.ts`.

⚠️ **`onConflictDoNothing`, e não o upsert da API** — a diferença é o que cada lado quer dizer. A
cascata só grava o que estava **ausente**: ela lê o que existe, separa o que falta e resolve só isso.
Conflito aqui é sempre corrida entre duas sugestões pedindo o mesmo endereço novo, e nessa corrida
quem escreveu primeiro está tão certo quanto quem chegou depois.

Sobrescrever seria pior que inútil: se uma das duas caiu ao centroide de município porque o CEP falhou
só para ela, a escrita tardia **rebaixaria** a coordenada boa — e o endereço ficaria em `city` para
sempre, porque a cascata nunca mais reconsulta o que já está em base. Degradação que gruda.

Melhorar coordenada existente é o degrau 2, na API. Aqui não há decisão de precisão a tomar, e é por
isso que a ordenação não precisa existir deste lado.

**Verificação:** `bun run --cwd apps/worker-transportada typecheck` → verde.

### T004 ✅ e T005 ✅ 2026-09-01 — O degrau de graça

Contrato escrito **antes** do gateway, vermelho pelo motivo certo
(`Cannot find module '.../brasil-api-postal-code.gateway.js'`).

`worker/test/routing/postal-code-geocoding.contract.ts`, oito casos, com **corpos medidos** contra a
BrasilAPI em 2026-09-01 — fixture inventado provaria o que nós achamos, não o que o provedor faz:

- lê a coordenada que a resposta já carrega → `postal_code`;
- **CEP geral de cidade pequena vira `city`** (RF9) — Sales Oliveira, `street: null`;
- **`-000` não é o discriminador**: Araraquara `14801-000` com logradouro segue `postal_code`;
- `location` ausente → `null` (o `/cep/v2` responde por vários serviços a montante);
- 404, 429 e transporte que lança → `null`, sem exceção subindo;
- pede o CEP canônico, só dígitos.

O gateway nunca lança: degrau que não resolve devolve `null` e quem chama desce a cascata. A
coordenada é guardada como **texto** — a coluna é `numeric`, e passar por `Number` traria erro
binário para dentro de dado comparado e exibido.

**Verificação:** `bun run --cwd apps/worker-transportada test` → **829 pass / 0 fail** (era 821).

⚠️ Nota de execução: rodar `bun test <arquivo>` da raiz faz os dois contratos de paridade falharem
com `ENOENT` — eles leem o arquivo da API por caminho relativo e exigem o cwd da app. Use
`bun run --cwd apps/worker-transportada test`.

### T006 ✅ 2026-09-01 — A tabela do último degrau

`municipality_centroids` (código IBGE como PK, UF, coordenada, carimbos), migration
`20260901211242_municipality_centroids` com `rollback.sql` ao lado.

⚠️ **Correção do que a spec dizia:** ela chamava esta de "segunda exceção declarada" de tenant. São
**três** que já existiam — `geocoded_addresses`, `fuel_price_references` e `energy_tariff_references`
—, então esta é a quarta. O contrato novo assera a ausência de `company_id` no mesmo formato das
vizinhas, para não passar por esquecimento.

Três tropeços que valem ficar escritos:

1. **`db:generate` respondia `no_changes`** com a tabela declarada e registrada em `databaseSchema`.
   Faltava a linha `export * from './municipality-centroid.schema.js'` — é ela que o drizzle-kit
   enumera; o objeto `databaseSchema` é o schema de runtime, não a fonte do gerador.
2. **O CHECK de regex precisa de `sql.raw`.** `sql\`${col} ~ ${PADRÃO}\`` parametriza, e
   `checkSqlByName` devolve `$1` em vez do padrão. A convenção do repositório é
   `sql\`${col} ~ ${sql.raw(\`'${PADRÃO}'\`)}\``.
3. **`rollback.sql` que só faz `DROP TABLE` reprova.** Ele também apaga a própria linha de
   `drizzle.__drizzle_migrations`, com `GET DIAGNOSTICS` conferindo que removeu exatamente uma —
   senão o diário fica com uma migration a mais que as tabelas, e é isso que a integração pega.

A lista explícita de migrations em `static-migration.contract.ts` recebeu a nova entrada.

**Verificação:**

```
bun run --cwd apps/api-transportada db:check   → Everything's fine
bun run --cwd apps/api-transportada test       → 3823 pass / 23 skip / 0 fail
make migration-test                            → 90 pass / 0 fail (migration + rollback + reaplicação)
```

### T007 ✅ 2026-09-01 — Os 5.570 centroides

`scripts/municipality-centroid-build.py` roda **uma vez** sobre a malha do IBGE (27 requisições, uma
por UF, com pausa) e emite `src/database/seeds/municipality-centroids.json` (635 KB, versionado). O
centroide é o da **área** — laço de sapato, com os furos subtraídos e ilha/enclave somados por área —,
não o centro da caixa envolvente, que num município em forma de foice cai fora dele.

O seed passa pelo **use case**, nunca por `INSERT` bruto: `createSaveMunicipalityCentroidsUseCase`
valida cada linha na fronteira (código de sete dígitos, UF de duas letras, coordenada dentro da
Terra) e grava em lotes de 500 — 5.570 linhas num `insert` só estouram o limite de parâmetros do
Postgres. **Nada é gravado se alguma linha do lote for inválida**: meia base é pior que base nenhuma.

⚠️ **A T007 pegou um defeito na T004.** O fixture do contrato do gateway trazia `ibge.city` de Sales
Oliveira como `3545803` — que não é o código dela, e sim o de outra cidade a 230 km. Eu o **inventei**
dentro de um fixture cujo comentário afirma ser medido. O campo não é lido pelo gateway, então nenhum
teste ficaria vermelho; ele só apareceu porque o seed comparou o código com a malha. Os três corpos
foram remedidos e corrigidos, e o aviso ficou escrito no arquivo: campo inventado dentro de fixture
"medido" é a mentira que sobrevive à suíte inteira.

Conferência do dado: Ribeirão Preto `3543402` → `-21.2138406, -47.8218619` (certo); Sales Oliveira
`3544905` → `-20.8331134, -47.8540347`, a ~7 km do CEP que a BrasilAPI devolve — que é exatamente o
palpite de município que a ADR-0044 §5 descreve, e a razão de esta precisão sair da otimização.

**Verificação:**

```
bun run --cwd apps/api-transportada test                        → 3829 pass / 0 fail
bun run --cwd apps/api-transportada db:seed:municipality-centroids  → seeded: 5570
(reexecutado)                                                   → seeded: 5570
select count(*), count(distinct city_code) …                    → 5570 | 5570
```
