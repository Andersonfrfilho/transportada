# Feature 092 — Pular não é passar

## Problema e resultado

A suíte de integração da `api-transportada` **se pula sozinha quando não acha o banco**, e sai
anunciando sucesso. Quem roda `bun run test:integration` sem o `.env` carregado lê `66 pass` e
segue em frente; das 38 integrações, **136 testes não rodaram** — e nada na saída diz que o gate
não foi exercido.

Isso não é hipótese. É o que deixou o `6642de1c` chegar quebrado na staging: a política
`checkTrackingWindow` foi corrigida, o contrato HTTP que a exercita ficou para trás afirmando a
regra abandonada, e **as duas integrações do portal que provariam o caso estavam entre as 136**.
O gate local passou. O CI reprovou. Entre uma coisa e outra houve um commit publicado, uma sessão
de investigação e um segundo commit (`fd258662`) só para consertar o teste.

O resultado desta feature é que **falta de banco vire falha**, não silêncio — e que exista um
comando local que carregue o ambiente, do jeito que o worker já tem.

⚠️ **Isto não é "ligar os testes".** Eles já rodam, e passam. O defeito é a suíte não saber
distinguir _"rodei e passou"_ de _"não rodei"_, e reportar as duas do mesmo jeito. Um gate que não
sabe dizer que não rodou não é um gate.

## O que foi medido

Medido em 07/09/2026, na `api-transportada` desta base, contra o Postgres de teste local:

| medida                                                              | resultado                       |
| ------------------------------------------------------------------- | ------------------------------- |
| Arquivos `*.integration.ts`                                         | 38                              |
| Declaram `testWithPostgres = databaseUrl === undefined ? test.skip` | **35**                          |
| Cópias da resolução de `const databaseUrl`                          | **33** — não há seam            |
| `bun run test:integration` **sem** env                              | 66 pass · **136 skip** · 2 fail |
| `bun run test:integration` **com** env                              | 196 pass · 4 skip · 7 fail      |
| Alvo `make` para a integração da API                                | **não existe**                  |
| Alvo `make worker-integration`                                      | existe, e carrega o env         |
| `make check` inclui integração                                      | **não**                         |
| Variáveis distintas gateando teste                                  | **3** — ver abaixo              |

Três achados que explicam o resto:

- **São três variáveis, não uma.** `API_TEST_DATABASE_URL ?? DATABASE_URL` gateia as 38
  integrações; **`DRIZZLE_TEST_DATABASE_URL`** gateia os contratos de migration
  (`test/database-migration/support.ts:5`); `STORAGE_*` gateia o object storage. Carregar o
  `.env.test` resolve **uma só** — a terceira não existe em `.env` nem em `.env.test`, e é definida
  inline apenas pelo `make migration-test`. São dela os **4 skips que sobram** com o banco de pé:
  eles continuam calados mesmo com o ambiente carregado.
- **O seam que esta spec propõe já existe, e cobre um terço do problema.**
  `test/database-migration/support.ts` é ponto único, com timeout deliberado e comentário
  explicando por quê. O desenho está certo e provado no repositório; falta generalizá-lo — e
  unificar as três variáveis é parte do trabalho, não detalhe.
- **35 de 38, com 33 cópias.** A decisão de pular é tomada 33 vezes, em 33 arquivos. O
  comportamento certo **já existe no repositório e é um arquivo só**: `server.integration.ts`
  resolve a URL no topo do módulo e **lança na carga** (`server.integration.ts:18`) — é ele que
  produziu o `1 error` da rodada sem env, e é o modelo a generalizar.

⚠️ **O padrão copiado já vazou por engano.** Em dois arquivos, quatro testes usam `test(` cru em
vez de `testWithPostgres` — `local-identity-seed` (3) e `company-user-listing` (1) — e por isso
correram sem banco e quebraram, enquanto seus vizinhos no mesmo arquivo pulavam. Foi esse escape
que gerou o `1 fail` da rodada sem env. Não é um segundo padrão deliberado: é a prova de que uma
convenção mantida à mão em 33 lugares **não se sustenta**, e de que o vazamento é silencioso nos
dois sentidos — ora se pula o que deveria rodar, ora se roda o que deveria pular.

⚠️ **O MinIO não é pulo legítimo, e nem chega a pular.** `make up` sobe o MinIO **e cria o bucket**
(`storage-bootstrap`, `Makefile:103`), então a capacidade está sempre presente; os 2 testes de
`cte-archive-gateway` **rodam e falham** quando o bucket não bate — medido isolado: `0 pass, 2 fail`.
A única justificativa escrita de pulo opt-in no repositório é a do **OSRM** (`Makefile:271`: _"a
integração comum não pode exigir um dataset de centenas de MB"_), e ela não se estende a um serviço
que sobe junto com o Postgres. Esta spec **não preserva** o pulo por object storage.

⚠️ As **7 falhas com env se dividem**: 5 são timeout de 5s em `fleet-vehicle-repository` e
`fuel-price-repository`, que passam isolados (18 pass, 0 fail) — contenção no Postgres
compartilhado, não defeito, fora do escopo. As outras **2 são o `cte-archive-gateway`**, que falha
por bucket ausente: defeito de verdade, hoje escondido no meio dos flakes.

## Fora do escopo

- **Os 5 timeouts sob carga.** Investigação própria: ou o limite de 5s é curto para a suíte
  paralela, ou esses dois arquivos disputam a mesma tabela. Não se conserta junto.
- **O pulo por capacidade genuinamente opcional.** Só o **OSRM**, no worker, se qualifica hoje — o
  comentário em `Makefile:271` diz por quê: a integração comum não pode exigir um dataset de
  centenas de MB. Esta spec preserva **esse** pulo, e nenhum outro. O do object storage não se
  qualifica (ver acima), e o dele nem existe de fato.
- **As 2 falhas do `cte-archive-gateway`.** São defeito real de fixture — o bucket do `.env.test`
  não bate. Consertar é trabalho separado; esta spec só faz parar de escondê-las.
- **`worker-transportada` e `cron-transportada`.** O worker já tem alvo `make` que carrega o env, e
  nenhum dos dois usa o padrão de skip por banco. Nada a fazer ali.
- **A reformatação de 50 `snapshot.json` por `bun run db:test`.** Achado da mesma sessão, defeito
  separado.

## Histórias priorizadas

### P1 — A suíte recusa rodar sem banco

**Given** um ambiente sem `API_TEST_DATABASE_URL` nem `DATABASE_URL`
**When** alguém roda a suíte de integração da API
**Then** ela termina com código diferente de zero **antes** de executar teste algum, e a mensagem
nomeia o comando que carrega o ambiente.

### P2 — Existe um comando local que carrega o ambiente

**Given** a infra local de pé
**When** alguém roda o alvo `make` da integração da API
**Then** o `.env` é carregado como o CI faz, e as 196 rodam.

### P3 — As três variáveis param de discordar

**Given** o ambiente carregado pelo alvo `make`
**When** a suíte roda
**Then** os contratos de migration rodam junto — hoje eles pulam calados porque gateiam por
`DRIZZLE_TEST_DATABASE_URL`, que nenhum dos dois arquivos de env define.

## Requisitos funcionais

- **RF1** — A resolução do banco de teste passa a viver em **um lugar só**, consumido pelos 38
  arquivos. As 33 cópias saem.
- **RF2** — Sem banco declarado, esse ponto único **falha**. Falhar é o padrão; pular deixa de ser
  alcançável por ausência de variável obrigatória.
- **RF3** — A mensagem de falha nomeia o comando certo. `"A PostgreSQL test URL is required"` não
  diz a quem a lê o que fazer em seguida.
- **RF4** — Existe `make api-integration`, no molde do `worker-integration`: sobe o que precisa,
  carrega o env, roda.
- **RF5** — As três variáveis (`API_TEST_DATABASE_URL`/`DATABASE_URL`, `DRIZZLE_TEST_DATABASE_URL`,
  `STORAGE_*`) passam pelo mesmo ponto e são declaradas **num lugar só**. O alvo `make` do RF4 as
  supre todas — hoje `.env` e `.env.test` não definem a segunda, e por isso os contratos de
  migration pulam mesmo com o ambiente carregado.
- **RF5b** — O único pulo por capacidade opcional que sobrevive é o do OSRM, no worker, declarado
  numa lista fechada e distinguível na saída do pulo por defeito. Object storage sai da lista.
- **RF6** — Um contrato falha quando um `*.integration.ts` novo não passa pelo ponto único. Sem
  isso a regra vale só para os 38 de hoje.

## Requisitos não funcionais

- Não aumentar o tempo do CI: ele já carrega o `.env` com `set -a` antes de rodar
  (`ci.yml:112`), e deve continuar verde sem mudança.
- Nenhum teste que hoje passa muda de resultado.
- A mudança é de andaime de teste: nenhum arquivo de `src/` entra.

## Casos extremos e falhas

- **Rodar um arquivo só** (`bun test ./test/integration/x.integration.ts`) sem env: falha igual.
  É o caminho de quem está depurando, e é justamente onde o silêncio engana mais.
- **`API_TEST_DATABASE_URL` presente e `DATABASE_URL` ausente** (e vice-versa): a precedência de
  hoje se mantém; a spec não muda qual vence.
- **Banco declarado mas inalcançável:** já falha hoje, na conexão. Não é caso novo.
- **`DRIZZLE_TEST_DATABASE_URL` ausente com as outras presentes:** é o caso de hoje, e é o que
  produz os 4 skips silenciosos. Passa a falhar como os demais.
- **Object storage inalcançável:** falha, não pula — é o comportamento de hoje, e ele fica.
- **CI:** carrega o env antes de invocar; o guard nunca dispara lá. Se disparar, é sinal de que o
  `.env` do runner quebrou — e aí falhar é o comportamento desejado.

## Critérios de aceite

- [ ] `bun run --cwd apps/api-transportada test:integration` sem env → **exit ≠ 0**, nenhum teste
      executado, e a mensagem cita `make api-integration`.
- [ ] `make api-integration` com a infra de pé → **200 pass** (os 196 de hoje mais os 4 contratos
      de migration que deixam de pular), e as 2 falhas do `cte-archive-gateway` visíveis em vez de
      diluídas.
- [ ] `grep -c "const databaseUrl" test/integration/*.integration.ts` → **0**.
- [ ] `server.integration.ts` passa a usar o ponto único, e o guard dele sai — o comportamento
      dele vira o de todos.
- [ ] Os quatro testes que escaparam do skip (`local-identity-seed` ×3, `company-user-listing` ×1)
      deixam de ser possíveis: com o guard, `test` e `testWithPostgres` passam a ser a mesma coisa.
- [ ] Contrato novo reprova um `*.integration.ts` que resolva o banco por conta própria.
- [ ] `make check` segue sem integração — quem quiser o gate completo roda os dois. (Ver Dúvidas.)
- [ ] CI verde sem alteração no `ci.yml`.

## Dúvidas

**Resolvida por medição — o pulo do MinIO.** A primeira versão desta spec perguntava se ele deveria
virar falha no CI, tratando-o como pulo legítimo por analogia com o OSRM. A analogia não se
sustenta: `make up` sobe o MinIO e cria o bucket, então a capacidade está sempre presente, e os
testes de `cte-archive-gateway` **rodam e falham** em vez de pular. Não há decisão a tomar — há uma
premissa errada removida, e duas falhas reais que a spec passa a expor (§ Fora do escopo).

- `[NEEDS CLARIFICATION: make check passa a incluir a integração?]` Hoje não inclui, e é por isso
  que "rodei o gate" não quer dizer "rodei as integrações" — a mesma confusão que originou esta
  spec, um nível acima. Incluir exige infra de pé para o gate mais citado do repositório e deixa
  `make check` bem mais lento. Não bloqueia o resto; decide só o último critério de aceite.

## 🤖 Modelo recomendado

| etapa                                             | modelo    |
| ------------------------------------------------- | --------- |
| Desenhar o ponto único e a fronteira falha × pulo | `opus` 🧠 |
| Implementar o guard, o alvo `make` e o contrato   | `sonnet`  |
| Passe mecânico de substituição nos 33 arquivos    | `haiku`   |
