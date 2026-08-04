# Evidências — Feature 026

Formato de cada registro: task, comando rodado, saída relevante e o que ela prova. Nenhuma senha,
código de ativação, segredo de client, contato em claro ou dado fiscal real entra aqui.

## T000a — contrato falhando do provisionamento

```
$ bun test ./test/environment-provisioning.contract.test.ts
error: Cannot find module '../../src/database/environment-provisioning.error'
 0 pass  1 fail  1 error
```

Prova o vermelho pelo motivo certo: o contrato existe e o comando não. Suítes registradas na cadeia
explícita — `test/environment-provisioning.contract.test.ts` no `test` do `package.json` da API e
`test/integration/environment-provisioning.integration.ts` no `test:integration`.

O contrato cobre: leitura da empresa e do primeiro admin **a partir da configuração**; recusa de
`DATABASE_URL` ausente ou não-PostgreSQL, de issuer fora da política de URL confiável, de
identificador de empresa que não é UUID e de sujeito em branco; recusa de chave sósia
(`companyId` / `company_id`) para provar que a empresa não vem de payload; ausência do valor
recusado na mensagem de erro; e validação **antes** de abrir o banco.

## T000b — comando idempotente na imagem da API

```
$ bun test ./test/environment-provisioning.contract.test.ts
 9 pass  0 fail

$ bun test ./test/integration/environment-provisioning.integration.ts
 5 pass  0 fail  21 expect() calls  [3.20s]
```

Os cinco casos de integração rodam contra Postgres descartável com as migrations aplicadas e provam:

1. primeira execução cria empresa, usuário de identidade, identidade externa, vínculo e o papel
   `company-admin` — e a segunda execução devolve `created: []`, sem duplicar nem sobrescrever;
2. três execuções concorrentes deixam exatamente uma linha de cada (lock consultivo por transação);
3. papel acrescentado à mão depois do provisionamento sobrevive, e empresa alheia desabilitada
   continua desabilitada;
4. vínculo desabilitado por decisão humana faz o comando recusar com
   `EnvironmentProvisioningConflictError`, sem reativar nada;
5. identidade que já existe para o mesmo `issuer` + `subject` é reaproveitada, sem criar um segundo
   usuário.

Gates:

```
$ bun run --cwd apps/api-transportada test   → 1486 pass  1 skip  0 fail
$ bun run lint                               → limpo nas quatro apps
$ bun run typecheck                          → limpo nas quatro apps
$ bun run format:check                       → limpo
$ bun test ./test/keycloak-realm.contract.test.ts        → 6 pass
$ bun run --cwd apps/frontend-transportada test          → 600 pass
```

Os dois últimos existem porque `.env.example` ganhou `PROVISION_COMPANY_ID` e
`PROVISION_ADMIN_SUBJECT`, e há contratos que leem esse arquivo.

Ligação com o deploy: `deploy/api/railway.json` roda o comando no `preDeployCommand`, depois da
migration. Ambiente que não declarou nenhuma das duas variáveis imprime `{"provisioning":"skipped"}`
e sai zero; declarar só uma delas é erro de configuração, não silêncio.
