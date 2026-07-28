# ADR 0006 — XML fiscal imutável em object storage

- Status: aceito
- Data: 2026-07-20
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

O XML original da NF-e é evidência fiscal e será necessário para emissão de
CT-e. Guardá-lo apenas normalizado perde informação; guardá-lo em coluna grande
do PostgreSQL aumenta backup, I/O e acoplamento. Upload para S3 e commit no
banco, porém, não formam uma transação distribuída.

O projeto já usa MinIO local e exige que bibliotecas reutilizáveis sejam
publicadas em `adatechnology-packages`.

## Decisão

1. Criar e publicar `@adatechnology/object-storage-provider`, Bun-first e
   compatível com MinIO/AWS S3.
2. Manter buckets privados e keys opacas prefixadas por tenant.
3. Nunca usar nome de arquivo, CNPJ ou chave NF-e como autoridade ou key direta.
4. Exigir escrita create-only (`If-None-Match: *` ou semântica equivalente)
   para staging e objetos finais; overwrite nunca é implícito.
5. Em conflito de key final, comparar SHA-256: hash igual é replay e reutiliza
   a referência; hash diferente é falha fatal sem substituir bytes.
6. Calcular SHA-256 durante o stream e persistir tamanho, MIME, provider,
   bucket, key, hash, tenant, tipo e timestamps em `stored_objects`.
7. Preservar os bytes originais sem reformatar XML.
8. Criar a importação `PENDING`, enviar para staging e só então confirmar
   `QUEUED` + outbox na mesma transação PostgreSQL.
9. Usar compensação idempotente para upload/finalização incompletos. Um
   reconciliador com lease remove staging expirado apenas quando abandonado ou
   já promovido; staging ativo e objeto fiscal final não são removidos.
10. Promover/copy o XML validado para key final imutável antes de marcar o item
    importado.
11. Download passa pela API depois de autenticação, tenant e `invoices.read`;
    signed URL é capacidade do provider, não resposta padrão do MVP.
12. XML não entra em RabbitMQ, logs, auditoria, listagem, cache PWA ou erro.
13. API e worker possuem adapters próprios sobre o package publicado e não
    importam fonte um do outro.

## Chaves

Formato conceitual:

```text
tenants/{companyId}/nfe-imports/{importId}/staging/{objectId}
tenants/{companyId}/nfe-documents/{documentId}/original/{objectId}.xml
tenants/{companyId}/nfe-events/{eventId}/original/{objectId}.xml
```

Todos os segmentos são IDs validados gerados pelo servidor. Nome original fica
somente em metadado sanitizado.

## Segurança

- rejeitar bucket/key inválidos, path traversal e tamanho divergente;
- credenciais e endpoint vêm de configuração confiável;
- provider retorna erros estáveis sem segredo, bucket ou key;
- `GET /nfe-documents/:id/xml` responde `404` igual para ausente/cross-tenant,
  `Content-Disposition` seguro e `Cache-Control: no-store`;
- objetos staging e finais são separados por tipo e política;
- testes varrem logs/respostas/fila/cache para ausência de XML;
- os exemplos locais e o certificado real não entram em fixtures ou commits.

## Consequências

- PostgreSQL mantém metadados consultáveis sem carregar documentos grandes;
- MinIO local reproduz o contrato S3 antes de Railway;
- crash entre S3 e banco deixa estado reparável, não sucesso silencioso;
- backup/restore precisa coordenar banco e storage;
- retenção/exclusão legal permanece política futura e não apaga XML nesta
  feature.

## Testes

- put/get preserva bytes e SHA-256;
- segundo put na mesma key não sobrescreve; hash igual é replay e hash
  diferente falha;
- hash/tamanho divergente falha;
- dois tenants nunca resolvem a mesma key;
- falha antes/depois do upload executa compensação idempotente;
- reconciliador concorrente remove somente staging expirado elegível;
- download cross-tenant não acessa o provider;
- MinIO real cobre streaming, path-style, health e shutdown;
- nenhum XML aparece em log, outbox, RabbitMQ, auditoria ou cache.

## Rollback

Antes de dados reais, remover adapters, migration e package pin em ordem
reversa. Depois de existir XML fiscal, não excluir objetos/tabelas: desabilitar
novas importações, preservar referências e aplicar correção por roll-forward.
