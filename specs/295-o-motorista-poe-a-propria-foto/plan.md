# Plano — spec 295

## API (`apps/api-transportada`)

- `src/shared/api.constant.ts`: `API_ME_PICTURE_PATH = '/me/picture'`.
- `src/identity/presentation/me-picture.routes.ts`: `createMePictureRoutes({ userPicture })` com GET, PUT, DELETE,
  política `{ membership: 'active', scope: 'company' }` (a mesma de `/me/whatsapp-phone`), `userId` =
  `context.scope.userId`. Reaproveita `parseUserPictureUpload` e `UserPictureUseCase` (valida, grava, escreve o atributo
  `picture` do Keycloak quando há `publicBaseUrl`, token público gira a cada troca).
- `src/main.ts`: monta as rotas ao lado de `createUserPictureRoutes`, com a mesma instância do caso de uso.
- Contrato: `PUT` → `{ data: { byteSize, mimeType, sha256, updatedAt } }` (igual à rota administrativa); `GET` → bytes;
  `DELETE` → 204; erros `USER_PICTURE_*` já existentes.
- Teste: `test/me-picture.contract.test.ts` (registrado no `package.json`).
- Teto de requisições: a rota administrativa não tem; esta também não (corpo ≤ 256 KiB, autenticada, por membership).

## Segurança e LGPD

- Alvo só pelo token (RF4); a rota nem declara parâmetro de id.
- Conteúdo validado por assinatura, não pelo `content-type`; `no-store` na leitura.
- A foto é dado pessoal; o endereço público segue o token de 32 bytes que gira a cada troca (`docs/SECURITY.md`).
- Falha do Keycloak ao escrever o atributo não desfaz a gravação (comportamento existente).

## App do motorista (`apps/frontend-driver`)

- `modules/identity/shared/userPictureCompression.service.ts`: cópia por valor da compressão do painel.
- `modules/identity/shared/userPictureClient.service.ts` + `queries/useOwnPicture.query.ts`: GET/PUT/DELETE
  autenticados; a foto vira `blob:` URL (cabe no `img-src` atual); após PUT/DELETE a query é atualizada, sem relogin.
- `modules/identity/components/DriverAvatar.component.tsx`: foto ou iniciais; `onError` volta às iniciais.
- Perfil: `<input type="file" accept="image/*">` (galeria/câmera pelo seletor do sistema) + "Trocar foto"/"Remover foto".
- Cabeçalho, Perfil e `renderAuthorAvatar` das conversas (autor = nome do próprio perfil) usam `DriverAvatar`.
- Locale pt/en; testes registrados na lista do `package.json` do app.

## Fase 4 (CNH)

Spike com `opus` antes de qualquer código; ver `tasks.md`. Bloqueada por `[NEEDS CLARIFICATION]` da spec.
