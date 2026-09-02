# Evidência — 078

## T001 — A decisão, e a reversão que a corrigiu

**Decidi tolerância, implementei, e catorze testes existentes me reprovaram.**

O raciocínio original: `hasExactKeys` reprova chave ausente (proteção alta), tipo errado (alta) e
chave desconhecida a mais — e esta, argumentei, "não protege nada, porque por definição o cliente
não a usa".

Falso. Os nomes dos testes dizem o que ela faz:

```
rejects tenant identity and extra fields in settings responses
keeps the trip dto strict, free of tenant or xml fields
recusa um resumo de credencial que traga o token de volta
rejects an option carrying a field beyond the three the dialog needs
```

Não é guarda de contrato: é **defesa em profundidade contra vazamento**. Se a API algum dia
devolver token, identidade de tenant ou XML fiscal — por defeito, por refactor, por rota errada — o
cliente recusa em vez de guardar ou renderizar.

Tolerar chave a mais desarmaria isso em **doze arquivos de uma vez**, para consertar um descompasso
de deploy: seria trocar uma classe de indisponibilidade por uma classe de vazamento. Revertí o
código, reescrevi a D1, e a decisão virou **atomicidade**.

## Fase B — O deploy sobe junto (T002–T004)

`test/deploy/pipeline-change-filter.contract.ts`: mudar a API arrasta as apps que **validam o corpo
dela**; mudar uma app de cliente arrasta a API; e a landing **fica de fora**, porque não valida
corpo de API — arrastá-la seria pagar pipeline por acoplamento que não existe.

`changed-targets.sh` passou a listar os caminhos cruzados. E a T004 trava o que a atomicidade não
pode virar: **"sobe metade quando o gate cai"** — que é como o descompasso começou. `needs: gate`
nos três jobs, afirmado por contrato.

## Fase C — O sentido inverso (T005–T006)

⚠️ **Aqui o modelo de chaves exatas mostrou um limite que eu não havia previsto:** com igualdade
exata, "campo opcional" **não se expressa**. Tirar da lista faz a chave presente ser recusada como
desconhecida; deixar na lista faz a chave ausente ser recusada. Nenhum dos dois serve para o
intervalo entre o deploy da API e o do bundle.

A saída foi separar **permitidas** de **obrigatórias** (`hasKeys` em `tripGuards.validation.ts`):
`allowed = obrigatórias ∪ opcionais`, e chave fora de `allowed` **segue recusada** — a proteção
contra vazamento fica inteira. `TRIP_DETAIL_OPTIONAL_KEYS` carrega `occupancy` e a disciplina está
escrita ali, onde ela se aplica.

Contrato com cinco casos, incluindo os dois que impedem a disciplina de virar porta aberta: campo
opcional **presente com forma errada** reprova, e campo **antigo** ausente reprova.

## Fase D — O sintoma deixa de ser mudo (T007–T008)

`/health` passou a carregar `revision`. ⚠️ Sem a variável ele responde **`unknown`, nunca omite o
campo**: campo que some obrigaria quem consulta a distinguir "não sei" de "esta versão é antiga e
não tinha o campo" — a ambiguidade que a task existe para eliminar.

Cinco contratos de saúde afirmavam o corpo **por extenso**, como deve ser num endpoint público, e
reprovaram até o campo entrar neles.

## Suíte

```
bun test (API)            3969 pass · 0 fail
bun run test (frontend)   2277 pass · 0 fail
playwright (smoke)        45 passed
make check                EXIT=0
```

## Pendente

⚠️ **A verificação em staging não prova esta spec.** O que ela muda é o comportamento do **pipeline**
e a tolerância no **intervalo entre dois deploys** — nenhum dos dois se vê numa tela. O que dá para
conferir é que o `/health` responde `revision`, e que um commit que toca só a API dispara o deploy
do frontend também. As duas coisas se veem no próximo deploy, não numa navegação.

---

## ⚠️ O pipeline estava quebrado por outra causa, e ela travava tudo

A verificação em staging não podia acontecer: **quatro deploys seguidos falhavam em ~2min50**,
incluindo um commit **só de documentação** e um de outra pessoa. O sintoma era mudo — o compose
dizia apenas `container transportada-local-keycloak-1 exited (1)`.

Reproduzi local, idêntico, e o log do contêiner deu a causa:

```
ERROR: Unrecognized field "_comment" (class org.keycloak.representations.idm.RealmRepresentation)
```

`compose.yaml` montava **o diretório `realm/` inteiro** em `data/import`, e `--import-realm` lê tudo
que houver ali como `RealmRepresentation`. O `spa-redirect-uris.json` — que **não é realm** — ganhou
um `_comment` no commit `f964c615`, e o Keycloak passou a morrer no boot.

⚠️ **É a mesma classe de defeito da própria spec 078**, num JSON em vez de num corpo de API: um
consumidor estrito recusando campo desconhecido, e a queda aparecendo longe da causa.

Corrigido montando **o arquivo do realm**, não a pasta — assim `realm/` continua livre para guardar
o que não é realm. Contrato em `keycloak-realm.contract.ts` guarda os dois sentidos.

```
SERVICES="postgres keycloak" make up   →  keycloak-1  Healthy
make check                             →  EXIT=0
```

## Verificação em staging (2026-09-02)

**A atomicidade funcionou na primeira oportunidade real.** O commit do conserto do Keycloak tocou
`compose.yaml` e um teste da API — e o deploy subiu **`deploy-api`, `deploy-frontend`,
`deploy-client` e `deploy-landing`**, as quatro com sucesso. Antes desta spec, um commit assim teria
publicado a API sozinha.

**A revisão aparece nos dois endpoints:**

```
GET /health/live   → { revision, service: "api", status: "ok", timestamp }
GET /health/ready  → revision presente
```

⚠️ **E o primeiro valor medido foi `unknown` — o que revelou uma metade que faltava.** O deploy é
por **imagem**, então a Railway não popula variável de git: `RAILWAY_GIT_COMMIT_SHA` não existe no
serviço. O campo estava no ar e não dizia nada.

Foi a decisão de **nunca omitir o campo** que tornou isso legível: com `unknown` no corpo dava para
ver que o campo existe e o valor não está configurado. Se ele sumisse quando não houvesse variável,
o sintoma seria idêntico ao de uma versão antiga sem o campo — a ambiguidade que a task existia
para eliminar, aparecendo na própria task.

`railway-deploy.sh` passou a gravar `DEPLOYED_REVISION` a partir do `GITHUB_SHA`, com
`--skip-deploys` (para não disparar um segundo deploy sobre o que está subindo) e sem derrubar o
deploy se a gravação falhar — `unknown` é legível, deploy interrompido não é.
