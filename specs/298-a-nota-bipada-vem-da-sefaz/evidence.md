# Evidência — 298

## Diagnóstico de origem (06/11/2026, produção, só leitura)

- 924712, 924713, 924725, 924727, 924728: nenhuma linha em `nfe_documents`, `trip_documents` ou `nfe_import_items`.
- Cursor DF-e em dia: `ult_nsu = max_nsu = 55935`, `updated_at` 11:05 UTC, importações horárias `completed`.
- Série 2 do mesmo emitente presente só de 924741 a 924809 (emitidas 03/11); nada abaixo de 924741.
- 316 notas `source = 'upload'`, 96 delas em viagem: importação manual já alimenta viagens.

## T0.1 — script de consulta por chave

Escrito (somente script; **nenhuma chamada a SEFAZ ou à produção foi feita**):

- `tmp/ops/producao-consulta-por-chave.sh <chave>`: valida 44 dígitos, avisa que conta 1 das 20 consultas/hora do CNPJ,
  exige digitar `sim`, e roda `railway ssh -p 62de4c69-… -s worker -e production` com o helper em base64.
  `REPO="${REPO:-$(git rev-parse --show-toplevel)}"`, sem caminho fixo.
- `tmp/ops/producao-consulta-por-chave.mjs`: roda no container do worker (`bun -e`, cwd da app). Reusa do `dist/` o
  `DrizzleNfeDistributionProfileRepository` + `createDigitalCertificateSecretService` (mesmo certificado/perfil da rotina de
  distribuição), faz **uma** `NfeDistribuicaoProvider.consultarPorChave` e imprime só linhas `__RESULT__`: `ambiente`, `cStat`,
  `xMotivo`, `schema`. O `cStat`/`xMotivo` vêm da resposta bruta (intercepta `fetchSefaz`), porque o pacote 0.4.0 **lança**
  `Error` para qualquer cStat fora de 137/138 (656 com texto próprio) e devolve `undefined` no 137: sem isso o cStat se perderia.
  Nunca imprime XML, certificado ou senha; mensagem de erro só sai se for da SEFAZ.

Como rodar (Arch, `railway whoami` ok): `bash tmp/ops/producao-consulta-por-chave.sh <chave de uma nota de 06/11>`.
Uma só empresa no banco é escolhida sozinha; havendo mais de uma, `COMPANY_ID=<uuid>`.

Validação feita: `bash -n` (ok), parse do helper (`bun build --no-bundle`, ok), quoting do `sh -c`/`bun -e` testado local com
payload trivial. `shellcheck` não instalado.

**Rodar em produção: pendente de aprovação humana — cStat ainda não registrado.** Registrar aqui `cStat`/`xMotivo`/`schema`
ao rodar.
