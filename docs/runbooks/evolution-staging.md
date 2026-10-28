# Runbook — Evolution API em staging (spec 281)

O Evolution é o gateway de WhatsApp gratuito (não oficial, risco de banimento: spec 281 R1). Este runbook cobre só o
**staging**. Produção tem runbook próprio, e nada aqui vale para ela sem aprovação do dono.

> Estado (28/10/2026): o serviço `evolution-api` (com `evolution-postgres` e `evolution-redis`) está declarado em
> `.railway/railway.ts` só para staging. O "Criar e conectar" (PR #404) só foi testado com resposta simulada: o primeiro
> teste real, com o número do dono, ainda não foi feito. Produção não tem Evolution.

## O que existe

- **Serviço Evolution no Railway, no ambiente de staging.** Postgres e Redis próprios, nunca compartilhados com a API.
- **Chave global** da instalação do Evolution (`AUTHENTICATION_API_KEY`): mora no serviço Evolution. A API de **staging**
  a recebe por referência (`EVOLUTION_GLOBAL_API_KEY=${{evolution-api.AUTHENTICATION_API_KEY}}`, com
  `EVOLUTION_BASE_URL=http://evolution-api.railway.internal:8080`) só para criar a instância da empresa; nunca vai ao
  banco, ao navegador nem a log. Sem as duas variáveis (caso de produção) a tela pede endereço e chave à mão.
- **Chave de cada instância** (um número por empresa): guardada na API, cifrada por empresa (como `contractor_mail_settings`).
  Não existe em variável de ambiente.
- **Webhook por empresa**: `POST /public/whatsapp-evolution/:webhookId`. O segredo fica no cabeçalho
  `x-transportada-webhook-token`, gerado pela API e selado em `whatsapp_evolution_settings.webhook_secret_envelope`.

## Rotas da API para o dono (staging)

Todas em `/company-settings/whatsapp-evolution`, com `settings.manage`:

| Ação                                                                       | Rota                  |
| -------------------------------------------------------------------------- | --------------------- |
| Ler e gravar a configuração (URL, chave, provedor padrão, teto, intervalo) | `GET` e `PUT` na raiz |
| Criar a instância pelo Evolution do ambiente ("Criar e conectar")          | `POST …/provision`    |
| Estado da conexão (`open`, `connecting`, `close`)                          | `GET …/connection`    |
| QR code para ligar o número                                                | `POST …/qr`           |
| Apontar o webhook de novo (troca o segredo)                                | `POST …/webhook`      |

## Passos de rotina

1. **Ver se o serviço responde.** Abrir a URL do serviço Evolution de staging pelo painel do Railway (ambiente de staging).
   Se não responder, ver os logs (passo 2) antes de mexer em qualquer coisa.
2. **Ler logs do serviço.** Pelo painel do Railway, no serviço Evolution, ambiente de staging (ou pela ferramenta Railway
   do Claude). Nos logs não deve aparecer número, texto ou chave;
   se aparecer, é bug: avisar antes de continuar.
3. **Ver o estado da conexão.** `GET /company-settings/whatsapp-evolution/connection` com o token de uma conta de dono de
   staging. Se estiver `close`, pedir o QR de novo (`POST …/qr`) e ler com o WhatsApp do número de teste.
4. **Reiniciar o serviço Evolution.** Só se o estado travar em `connecting` por mais de alguns minutos. Pelo painel do
   Railway (Restart do serviço, ambiente staging). Depois repetir o passo 3.
5. **Apontar o webhook de novo** (depois de trocar a URL do serviço ou a chave): `POST …/webhook`. A resposta nunca
   traz o segredo.

## Queda e fallback

- Instância caída: o envio por WhatsApp falha com `whatsapp_disconnected` e a tela oferece o e-mail. Nada cai para a Meta
  sozinho. O e-mail não depende do Evolution: a queda não o atrasa.
- Número sem WhatsApp: `whatsapp_number_not_found`. Usar o e-mail.
- Número banido ou instância bloqueada (estado `blocked`): desligar o envio por WhatsApp na configuração da empresa e avisar
  o dono.

## Teste de aceite em staging (spec 281, critérios)

1. Conectar o número do dono pelo QR.
2. Enviar um boleto de teste a esse número pelo botão "Enviar por WhatsApp".
3. Responder no WhatsApp e confirmar que a resposta entra no fio da ocorrência.
4. Derrubar a instância (pelo painel, não pela API) e confirmar que o envio cai para o e-mail com erro tipado.

## O que nunca fazer

- Não copiar o valor da chave global para variável da API: só a referência `${{evolution-api.AUTHENTICATION_API_KEY}}`, e só em staging.
- Não rodar `railway config apply` sem `railway config plan` sem nenhum `Delete` (ver incidente de 27/10 em `producao.md`).
- Não compartilhar o Postgres ou o Redis com outro ambiente.
- Não ligar o Evolution em produção sem aprovação do dono.
- Não colar número, texto ou chave em chat, log ou PR.
