# Evidência

Saída de comando, não impressão. Cada seção fecha com o SHA do commit da task.

## Fase 1 — A viagem entrega seus comprovantes de uma vez

### T1.1 — Como a URL assinada é produzida

**Resposta: HMAC local (SigV4), sem chamada de rede.** A rota em lote assina **original e
miniatura**, como a rota de uma nota já faz.

Caminho lido, de cima para baixo:

1. `apps/api-transportada/src/trips/application/read-delivery-proof.use-case.ts` — `readDeliveryProofs`
   chama `downloads.createDownloadUrl` duas vezes por comprovante (original + miniatura, em
   `Promise.all`).
2. `src/trips/infrastructure/delivery-proof-download.gateway.ts` — `createDeliveryProofDownloadGateway`
   delega a `storage.createSignedDownload({ bucket, key, expiresInSeconds: 300, disposition:
'inline', filename })` e só soma `expiresAt` com o relógio local.
3. `src/storage/infrastructure/nfe-storage-gateway.ts:175` — repassa a `provider.createSignedDownload`.
4. `@adatechnology/object-storage-provider@0.3.0`, `dist/index.js:274-295` — `new URL(await
getSignedUrl(client, new GetObjectCommand({...}), { expiresIn }))`, com `@aws-sdk/s3-request-presigner`.
   O `S3Client` (`dist/index.js:173`) é criado com `credentials: { accessKeyId, secretAccessKey }`
   **estáticas** — não há cadeia de provedores de credencial nem chamada de metadados. Presign SigV4
   é cálculo de HMAC sobre a requisição canônica; não toca o endpoint.

Medição (a prova de que não há rede): `createObjectStorageProvider` apontado para
`http://127.0.0.1:1` (porta fechada — qualquer round-trip falharia), 80 assinaturas seguidas de
`createSignedDownload` com `disposition: 'inline'`:

```
$ bun run ./sign-probe.ts        # de apps/api-transportada, arquivo descartado depois
80 assinaturas ms 40.2
```

≈ 0,5 ms por URL, e nenhuma falhou contra um endpoint inalcançável. Uma viagem com 40 comprovantes
são 80 assinaturas (original + miniatura) ≈ 40 ms de CPU, sem I/O.

**Decisão para a T1.5:** assinar **os dois** (`downloadUrl` e `thumbnailUrl`) por comprovante, com a
mesma serialização da rota de uma nota. O plano B ("só a miniatura, original sob demanda") fica
descartado — o custo que o motivava não existe. O teto de `?documentIds=` continua valendo, mas por
causa do tamanho da resposta e do diálogo (RNF5), não da assinatura.
