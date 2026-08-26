# Plano técnico — 066

## Contexto e premissas

Três máquinas prontas e desconectadas (ver `spec.md`): consulta de CNPJ atrás do painel, upload+OCR
atrás de sessão, leitura de PDF no navegador presa ao app do painel. A spec liga as três à landing e
constrói o único pedaço que não existe em lugar nenhum: **a tela de revisão de anexo**.

Premissa que sustenta o desenho: `aggregate_documents` é upsert por `(company_id, tax_id, type)` — o
que é seguro sob sessão e é uma porta aberta numa rota pública. Daí a tabela nova de rascunho.

## Arquitetura e arquivos afetados

**API**

| Arquivo                                                             | Mudança                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/aggregate-application-attachment.schema.ts`               | **novo** — `id`, `company_id`, `draft_id` (unique), `application_id` nulável, `type`, `stored_object_id`, `status`, `rejection_reason`, `expires_at` |
| `fleet/application/aggregate-application-attachment.use-case.ts`    | **novo** — `uploadDraft`, `attachToApplication`, `expireDrafts`                                                                                      |
| `fleet/presentation/aggregate-application-attachment.routes.ts`     | **novo** — rota pública de upload (Turnstile + rate limit)                                                                                           |
| `fleet/presentation/aggregate-application.routes.ts`                | aceita `attachmentDraftIds` no submit                                                                                                                |
| `companies/application/company-settings.port.ts`                    | `CompanyProfileLookupResult` ganha `situation`, `openedAt`, `mainActivityCode`, `mainActivityName`, `legalNature`, `size`, `simplesNacional`         |
| `companies/infrastructure/fiscal-company-profile-lookup.gateway.ts` | mapeia os campos que hoje descarta                                                                                                                   |
| `companies/presentation/public-cnpj-info.routes.ts`                 | **novo** — projeção pública (sem IE, sem e-mail, sem telefone)                                                                                       |
| `shared/api.constant.ts`                                            | dois caminhos públicos novos                                                                                                                         |

O upload reusa `assertAggregateDocumentBytes` e o `AggregateDocumentStoragePort` que já existem —
nada de segundo caminho de armazenamento.

**Pacote**

`packages/document-intake/` recebe o que hoje é `frontend-transportada/src/modules/document-intake/shared/`
(pdf.js loader, camada de texto, geometria de rótulo, dígito verificador, `documentKind`). O app do
painel passa a importar do pacote — **sem mudar comportamento**, e os 2012 contratos dele são a rede.
O mapa do CRLV fica onde está: é domínio do painel, não do pacote.

**Landing**

`modules/application/shared/cnpjLookup.query.ts`, `modules/application/shared/ccmei.service.ts`
(mapa de rótulos do CCMEI), `modules/application/components/AttachmentList.component.tsx`, e o
formulário passa a ter o bloco Empresa, condicional ao caminho MEI.

**Painel**

`modules/fleet/components/AggregateDocumentsCard.component.tsx` + hook, dentro de
`AggregateApplicationsTab`. Consome as três rotas que já existem.

## Contratos/API

```
GET  /public/cnpj-info?cnpj=00000000000000
     200 { data: { cnpj, legalName, tradeName, situation, openedAt, mainActivityCode,
                   mainActivityName, legalNature, size, address {...} } }
     404 quando a Receita não conhece — nunca 500 para o usuário

POST /public/aggregate-application-attachments        (multipart, Turnstile)
     201 { data: { draftId, kind: 'ccmei'|'cnh'|'crlv'|'unknown'|'scanned', extracted: {...}|null } }

POST /public/aggregate-applications
     + attachmentDraftIds?: string[]   → 202 invariável, como hoje

POST /aggregate-documents/{id}/review  { decision, rejectionReason }   (já existe, ganha tela)
```

## Dados, migration e rollback

Migration **aditiva**: uma tabela nova, uma coluna JSONB que já existe (`declared_data`) ganha bloco
novo sem alterar o tipo. Rollback é `DROP TABLE` da tabela nova — nada do que existe hoje muda de
forma, e por isso a 066 é publicável em pedaços.

Índices: `unique(draft_id)`, `index(application_id)`, `index(expires_at)` para o job de expurgo.

## Segurança e tenant

- `company_id` vem do host da landing (mesma resolução da 053), nunca do corpo.
- Turnstile + rate limit nas duas rotas públicas; o limitador **existe** (`rateLimit` em
  `defineAnonymousRoute`), ao contrário do que a 053 registrou na época.
- A projeção pública de CNPJ **omite** inscrição estadual, e-mail e telefone: são dados do titular,
  e a rota é anônima.
- Nome de objeto no bucket **sem** documento de pessoa (`security.md` §7) — chave por `draft_id`.
- Nenhum log com nome de arquivo, CNPJ ou conteúdo extraído (`security.md` §1).
- Bucket privado; download só por URL assinada de vida curta, como a rota atual já faz.

## Idempotência e concorrência

- Upload repetido gera `draft_id` novo — não há upsert, logo não há corrida.
- `attachToApplication` roda **na mesma transação** do submit; `draft_id` já vinculado é ignorado.
- `review` é idempotente por decisão: aprovar duas vezes não muda nada além de `updated_at`.

## Observabilidade

Contadores por `company_id`: upload aceito/recusado por assinatura, extração com e sem campo,
consulta de CNPJ com hit/miss/timeout. Sem PII, só identificador opaco.

## Estratégia de testes

TDD, caminho feliz e de falha. O que **não** vale como prova: contrato contra fixture de CCMEI que eu
mesmo escrevi provar que o mapa de rótulos está certo (é o buraco registrado na 048). Vale: PDF
sintético com camada de texto real lido pelo pdf.js real, mais smoke no navegador com o arquivo
entregue ao `input[type=file]` da tela.

## Riscos

1. **O mapa do CCMEI é palpite sem amostra real.** Mitigação: campo não casado fica vazio, nunca
   errado — casamento por igualdade de rótulo, como a 048 fez.
2. **pdf.js na landing pesa.** 434 kB + worker. Mitigação: `import()` só quando um arquivo é solto;
   se o orçamento da landing não aceitar, o anexo funciona sem leitura local (§ RNF).
3. **Rota pública de CNPJ vira proxy de consulta.** Mitigação: rate limit apertado + projeção mínima.
4. **Extrair o `document-intake` para pacote mexe no painel que está verde.** Mitigação: mover sem
   alterar, e rodar os 2012 contratos + os 36 smokes antes de qualquer outra task.
