# Plano técnico

## Contexto e premissas

Reusar o fluxo da feature 005 (`apps/api-transportada/src/nfe-imports`, `nfe-documents`): o parser de
`procNFe` e a gravação de `nfe_documents` já existem para a SEFAZ. O zip é uma nova **origem** de XML.

## Arquitetura e arquivos afetados

- `nfe-imports/application/import-nfe-xml-archive.use-case.ts`: abre o zip em memória (limites do RF6),
  extrai chaves, separa novas/existentes/inválidas e delega a gravação ao caminho existente.
- `nfe-imports/presentation`: `POST /nfe-imports/archive` (multipart, `invoices.import`) e `GET` do resumo.
- Frontend: botão "Importar zip/XMLs" na tela de NF-e com o resumo.
- Origem: novo valor `zip` para `triggered_by` (CHECK `nfe_imports_origin_ck` ampliado) — depende de
  confirmar o modelo de `nfe_imports` do 011.

## Dados, migration e rollback

Ampliar o CHECK de origem e guardar o resumo (totais + inválidas) em `nfe_imports`. Migration aditiva
com rollback ao lado; sem dado destrutivo.

## Segurança e tenant

`companyId` da sessão; permissão `invoices.import`; validação de zip (RF6); contrato negativo
cross-tenant.

## Idempotência e concorrência

Chave de acesso + unique por empresa; `ON CONFLICT DO NOTHING` contado como "já existia". Dois envios
simultâneos do mesmo zip não duplicam.

## Observabilidade

Log com `traceId`, totais e nome do arquivo (nunca o XML); entrada na auditoria de operações.

## Estratégia de testes

Contract test com o zip real reduzido (fixtures sintéticas, sem dado de cliente), zip bomba, `..`,
duplicata interna, outra empresa, reenvio. Evidência do cruzamento 264 existentes + 135 novas.

## Riscos

Divergência de regra "nota da empresa" entre SEFAZ e zip; zips grandes estourando memória (mitigar com
limites e streaming por entrada).
