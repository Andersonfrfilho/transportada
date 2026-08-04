# Tarefa — `RAILWAY_TOKEN` do ambiente `staging`

Handoff para quem for executar (humano ou agente). Tudo abaixo foi verificado em
2026-08-03; o que é passo de dashboard está marcado como tal.

## Objetivo

O gate de CI está verde e o deploy falha por falta de credencial. Ao fim desta
tarefa o workflow `Deploy` autentica no Railway e sobe os cinco serviços de
`staging`.

## Estado verificado

| Item                                            | Estado                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| Run `30866037619`                               | `gate / quality` ✅ · `gate / integration` ✅ · `deploy` ❌                            |
| Erro do job `deploy`                            | `RAILWAY_TOKEN:` vazio → `Unauthorized. Please check that your RAILWAY_TOKEN is valid` |
| `.env`, `.env.test` e os dois `.example`        | nenhuma chave `RAILWAY_*` — não há token para reaproveitar                             |
| `gh secret list` (repo) e environment `staging` | zero segredos                                                                          |
| Environments no GitHub                          | só `staging`; `production` ainda não existe                                            |
| Segredos que o workflow consome                 | um só: `RAILWAY_TOKEN` (`.github/workflows/deploy.yml:58`)                             |
| `railway` CLI 4.58.0                            | **não** tem comando de token — criação é dashboard                                     |

Repositório: `Andersonfrfilho/transportada`
Projeto Railway: `62de4c69-216a-4335-93a0-4942c6a95c54`

## Regras que valem durante a execução

- O token é **project token** com escopo do ambiente `staging`. **Não** use o
  `accessToken` do login pessoal em `~/.railway/config.json`: ele alcança todos os
  projetos da conta e expira, então o deploy quebraria sozinho.
- O valor **nunca** é impresso, ecoado, colado em log, em commit ou em conversa
  com um agente. Token que apareceu em terminal ou log é token queimado — rotacione.
- Nada de `gh secret set --body <valor>`: isso põe o token no histórico do shell.
  Use a forma com prompt, que lê da entrada padrão sem ecoar.

## Passos

### 1. Criar o token — dashboard, passo humano

Railway → projeto `62de4c69-216a-4335-93a0-4942c6a95c54` → **Settings → Tokens** →
criar token com o ambiente **staging** selecionado. Copie o valor uma vez; o
Railway não mostra de novo.

### 2. Gravar como segredo do GitHub Environment

Na raiz do repositório:

```bash
gh secret set RAILWAY_TOKEN --env staging
```

O `gh` pede o valor num prompt e não ecoa nada.

### 3. Conferir que entrou (mostra só o nome, nunca o valor)

```bash
gh secret list --env staging
```

Esperado: uma linha `RAILWAY_TOKEN`.

### 4. Re-disparar o deploy e acompanhar

```bash
gh workflow run Deploy --ref develop
gh run list --branch develop --limit 1
gh run view <run-id> --json jobs -q '.jobs[] | (.conclusion + "  " + .name)'
```

Se o job `deploy` falhar de novo, o log completo sai em
`gh run view <run-id> --log-failed`.

## Critério de conclusão

- `gh secret list --env staging` mostra `RAILWAY_TOKEN`.
- O job `deploy` do run seguinte conclui `success`.
- Os serviços de `staging` respondem — healthcheck da API e o frontend abrindo.

## Depois disto (fora do escopo desta tarefa)

Continuam pendentes, na ordem de `docs/spec/railway.md` §"Passos manuais":

1. Caminho do `railway.json` em _Settings_ de cada par serviço/ambiente — é o que
   liga `preDeployCommand` (migration da API), healthcheck e `cronSchedule`.
2. Environment `production` no GitHub: criar, configurar **required reviewers
   antes** de adicionar o token, e só então o `RAILWAY_TOKEN` de production.
3. Backup do `ENCRYPTION_KEYRING_JSON` dos dois ambientes, fora do Railway.
4. Domínios, `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`,
   `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN` e os `VITE_*` de production — só
   existem depois do primeiro deploy, e o frontend precisa de **rebuild** em
   seguida (os `VITE_*` são assados no build).
