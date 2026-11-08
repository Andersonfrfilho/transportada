# Plano — 301 Importar XML de NF-e por e-mail e por WhatsApp

Resultado da T0.1 (conferido no código em 08/11/2026). Spec descreve intenção; aqui está o que o código faz.

## Achados e decisões

| #   | Achado (arquivo:símbolo)                                                                                                                                                                                                                                                      | Decisão                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `main.ts:requestUploadImport` guarda **cada arquivo** no storage (`saveImportSource`) e chama `createRequestNfeImportUseCase`. O **zip não é aberto na API**: vira uma fonte (`sourceEntry`) e o worker (`worker-transportada/src/nfe-imports`) expande e dá um item por XML. | E-mail e WhatsApp só guardam o anexo e chamam o mesmo `requestImport`. Fila (outbox `transportada.nfe.import.requested`), item por XML, deduplicação e contadores já existem: RN1 e RN4 da spec são reaproveitamento, não código novo. O que falta é conferir o tamanho de lote no worker (T1.3). |
| 2   | `nfe_imports.requested_by_user_id` é `NOT NULL` com FK `(user, company)` (`database/nfe.schema.ts:114,138`).                                                                                                                                                                  | WhatsApp: usa o usuário dono do número cadastrado. E-mail: precisa de um usuário de sistema por empresa ("caixa de notas"); T1.1 decide entre usuário técnico e coluna anulável com `origin`. Padrão: usuário técnico (sem afrouxar constraint).                                                  |
| 3   | `nfe_imports.source` já aceita `upload`, `distribution`, `access_key` (check `nfe_imports_source_check`; spec 298).                                                                                                                                                           | T1.1 acrescenta `email` e `whatsapp` ao check e aos tipos (`NfeImportSource`, filtro `sourceEq`), migration aditiva com rollback.                                                                                                                                                                 |
| 4   | **Já existe um intake de e-mail no worker**: `worker-transportada/src/cargo-preview-email` (token, allowlist, janela de e-mails autenticados, MIME com teto, DKIM, rejecter com código estável, download de anexo pelo Resend). Corrijo o que disse antes: não é só config.   | O e-mail de notas é um **segundo ramo** desse intake (mesmas barreiras, mesmo rejecter e rastro), com perfil/endereço próprio e anexo `.xml`/`.zip` em vez de planilha. Nenhuma barreira nova inventada.                                                                                          |
| 5   | Grupo do WhatsApp: `evolution-group-inbound.service.ts:receive` só admite grupo **vinculado a um motorista** (`findGroupDriver` → `unknown_group`), e `readGroupMedia` lê só foto e localização; **documento é ignorado**.                                                    | Novo ramo antes de `findGroupDriver`: mensagem com `documentMessage` (XML/zip) **e marcação ao bot** é de importação, em qualquer grupo em que o bot esteja. Empresa vem da instância Evolution (webhook já é por empresa); o remetente precisa ser número cadastrado com permissão de importar.  |
| 6   | Conversa direta: `receiveMessage` (`chat === 'user'`) passa texto; mídia não é lida (`extractWhatsAppConversationText`).                                                                                                                                                      | Mesmo ramo de documento para conversa direta, com o mesmo serviço de autorização.                                                                                                                                                                                                                 |
| 7   | Download de mídia: foto usa `connection` + `rawMessage` (o Evolution não grava a mensagem, baixa só com o corpo do webhook).                                                                                                                                                  | Documento segue igual: `readGroupDocument` guarda `rawMessage`, o download roda **no worker** (não no webhook), com teto de bytes.                                                                                                                                                                |

## Desenho resumido

```
e-mail (Resend, webhook assinado) ─┐
WhatsApp (Evolution, documento) ───┼─► guarda o anexo + mensagem na fila ─► worker
tela "Enviar XML" (já existe) ─────┘                                         │
                                       requestImport (source upload|email|whatsapp)
                                                                              ▼
                                  worker nfe-imports: expande zip, lote, item por XML, retentativa
                                                                              ▼
                              resumo ao remetente (e-mail / WhatsApp) + aviso à operação se falhar
```

## Riscos

- Webhook da Evolution não pode demorar: o download do documento sai do caminho da requisição (achado 7).
- Número do grupo/remetente em formato LID: reaproveitar `identity.lidDirectory` do grupo (achado 5).
- Tamanho de lote hoje desconhecido no worker de importação: medir na T1.3 antes de fixar o padrão de 50.
