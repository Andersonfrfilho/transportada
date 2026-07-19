# ADR 0004 — Envelope criptográfico e armazenamento da credencial A1

- Status: aceito
- Data: 2026-07-19
- Decisores: mantenedor do projeto e revisão Codex Sol

## Contexto

A API precisa receber certificado A1 e senha, enquanto o worker precisará
decifrá-los futuramente para operações fiscais. O segredo não pode ficar em
plaintext, arquivo temporário, S3, logs, respostas, auditoria ou registros de
idempotência.

O repositório `transportada` não pode conter uma biblioteca reutilizável. A
implementação criptográfica deve ser publicada pelo repositório
`adatechnology-packages` e permanecer independente de domínio, framework e
storage.

O utilitário AES existente em packages legados é acoplado a Nest/cache e não
oferece AAD, versionamento ou rotação de chaves adequados.

## Decisão

1. Criar `@adatechnology/secret-envelope` como package ESM compatível com Bun
   `>=1.3`, sem dependências de runtime.
2. Usar AES-256-GCM pelo Web Crypto com chave de 32 bytes, nonce aleatório de
   12 bytes e tag de autenticação de 128 bits.
3. Exigir AAD em toda cifragem e decifragem. O package recebe bytes e não
   conhece empresa, certificado ou finalidade.
4. Representar o envelope em base64url canônico com `version`, `algorithm`,
   `keyId`, `nonce` e `ciphertext`. O último campo contém o resultado Web Crypto
   `ciphertext || authenticationTag`, com os 16 bytes finais reservados à tag.
5. Selecionar a chave exclusivamente por `keyId`. Chave desconhecida falha
   fechada; o provider nunca tenta todas as chaves.
6. Manter um keyring versionado em configuração confiável, com chave ativa
   explícita. Novas escritas usam apenas a chave ativa; leituras podem usar
   chaves anteriores ainda presentes.
7. Na aplicação, usar o AAD canônico
   `transportada:certificate:v1:<companyId>:<certificateId>:cte`.
8. Armazenar somente o envelope ativo em `jsonb` no PostgreSQL para que estado,
   rotação e auditoria participem da mesma transação.
9. Validar e cifrar a nova credencial antes da troca. Na transação, aposentar a
   anterior e remover definitivamente seu envelope.
10. Configurar a idempotência com chave HMAC separada da chave do envelope.
    Fingerprints nunca usam hash direto de senha ou persistem o request.
11. Gerar o HMAC sobre framing binário domain-separated e length-prefixed:
    prefixo `transportada:idempotency:v1`, nome da operação e cada campo
    normalizado em ordem fixa, sempre com tamanho unsigned de 32 bits big-endian
    antes dos bytes. `PATCH` usa o DTO validado; multipart usa bytes originais
    do certificado, senha UTF-8 e purpose.
12. Copiar as chaves do `SecretKeyRing` ao criar o provider. Mutar um
    `Uint8Array` do chamador depois da criação não altera o estado interno.
13. Fazer parsing estrito de versão, algoritmo e base64url; exigir nonce de 12
    bytes, ciphertext com pelo menos 16 bytes e recusar plaintext acima de
    1.048.576 bytes ou ciphertext decodificado acima de 1.048.592 bytes.
14. Não registrar valores de configuração em erros. O package não possui
    logger interno.
15. Fixar uma versão npm exata no consumidor somente após contracts, pack e
    instalação Bun limpa.

## Contrato público mínimo

```ts
export type SecretEnvelopeV1 = Readonly<{
  version: 1
  algorithm: 'A256GCM'
  keyId: string
  nonce: string
  ciphertext: string
}>

export type SecretKeyRing = Readonly<{
  activeKeyId: string
  keys: Readonly<Record<string, Uint8Array>>
}>

export type SecretEnvelopeProvider = {
  encrypt(input: {
    plaintext: Uint8Array
    additionalAuthenticatedData: Uint8Array
  }): Promise<SecretEnvelopeV1>

  decrypt(input: {
    envelope: SecretEnvelopeV1
    additionalAuthenticatedData: Uint8Array
  }): Promise<Uint8Array>
}
```

## Consequências

- API e worker poderão compartilhar o formato sem importar código entre apps.
- PostgreSQL mantém segredo e estado na mesma fronteira transacional.
- AAD impede mover um envelope entre empresas, certificados ou finalidades.
- Rotação de chave não exige recifrar imediatamente todos os envelopes.
- Remover uma chave ainda referenciada torna o envelope indecifrável.
- Aposentar uma credencial elimina seu segredo; restaurá-la exige novo upload.
- Strings e base64 podem deixar cópias sob controle do GC. Limpeza de buffers é
  best effort, não garantia física.

## Segurança e testes

- rejeitar chave de tamanho incorreto e chave ativa ausente;
- provar round-trip binário e nonce diferente para plaintext igual;
- adulteração de AAD, chave, nonce ou ciphertext deve falhar;
- não tentar fallback quando `keyId` é desconhecido;
- recusar base64url não canônico, versão/algoritmo desconhecido, nonce/tag
  inválidos e payload acima do limite;
- mutar o keyring original não pode alterar o provider já criado;
- provar que campos concatenáveis não colidem no framing HMAC e que DTOs
  normalizados equivalentes produzem o mesmo fingerprint;
- provar que ciphertext e erros não contêm plaintext, chave, AAD ou envelope;
- manter chaves não extraíveis após `crypto.subtle.importKey`;
- testar envelope antigo com keyring rotacionado;
- gerar fixtures efêmeras; nunca usar o PFX fornecido em teste automatizado.

## Rollback

Antes da publicação, remover o package e sua changeset. Depois da publicação,
nunca executar `unpublish`: consumidores voltam ao pin anterior e correções
recebem nova versão.

Na aplicação, rollback de código não restaura envelope aposentado. Enquanto
houver dados reais, mudanças de formato são aditivas e precisam continuar
decifrando versões persistidas.
