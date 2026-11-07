/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que o bot responde a cada mensagem da jornada no grupo (texto exato, com a marcação do WhatsApp). As horas vêm do relógio do teste: `at` é a hora
 * do registro (saída, chegada, baixa) e `eta` a chegada prevista pela estrada (25 min depois).
 */
export type JourneyClock = {
  readonly at: string
  readonly eta: string
  readonly farewell: string
  readonly greeting: string
}

export type JourneyExchange = { readonly answered: readonly string[]; readonly shown: string }

export function groupJourneyExpected({
  at,
  eta,
  farewell,
  greeting,
}: JourneyClock): readonly JourneyExchange[] {
  return [
    {
      answered: [
        `${greeting}

*Qual parada?* _Responda com o número da opção ou da nota:_
*1* - NF 17234 · PADARIA SOL NASCENTE
*2* - NF 17235 · MERCADO LUA CHEIA
*3* - NF 17236 · ACOUGUE ESTRELA`,
      ],
      shown: '@bot iniciar rota',
    },
    {
      answered: [`📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`],
      shown: '1',
    },
    {
      answered: [
        `*Saída registrada* 🚚
*Parada 1 de 3*
*NF 17234* · R$ 1.234,56
🏪 *PADARIA SOL NASCENTE*
🏢 Contratante: Distribuidora Aurora
📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000
📦 3 volumes
📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~${eta} (25 min)_
➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `${greeting}

📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `*Chegada registrada* 📍
Enviei para o escritório conferir o endereço. 📬
*Parada 1 de 3*
*NF 17234* · R$ 1.234,56
🏪 *PADARIA SOL NASCENTE*
🏢 Contratante: Distribuidora Aurora
📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000
📦 3 volumes para entregar
➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.
🔜 _Depois desta:_ *NF 17235* · MERCADO LUA CHEIA – SERTAOZINHO`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `🎙️ Estou escutando o seu áudio, só um momento. Já te mostro o que entendi para você confirmar.`,
        `🎙️ *Entendi assim:*

💬 _“cheguei”_

👉 *Está certo?* Responda com o número ou por áudio (_sim_ ou _não_):
✅ *1 - Sim*, pode seguir
❌ *2 - Não*, descartar`,
      ],
      shown: '🎤 (áudio: "cheguei")',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada nesta parada já foi registrada* às ${at}.
*Parada 1 de 3*
*NF 17234* · R$ 1.234,56
🏪 *PADARIA SOL NASCENTE*
🏢 Contratante: Distribuidora Aurora
📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000
📦 3 volumes

*O que você quer fazer agora?*
*1* - Entreguei _(mande a foto do canhoto)_
*2* - Não entreguei
*3* - Abrir ocorrência
*4* - Nada por enquanto`,
      ],
      shown: '1',
    },
    {
      answered: [
        `⚠️ *Falta a baixa desta parada.* Você chegou às ${at} e ainda não registrou a entrega.
*Parada 1 de 3*
*NF 17234* · R$ 1.234,56
🏪 *PADARIA SOL NASCENTE*
🏢 Contratante: Distribuidora Aurora
📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000
📦 3 volumes

*O que você quer fazer agora?*
*1* - Entreguei _(mande a foto do canhoto)_
*2* - Não entreguei
*3* - Sair para outra parada sem dar a baixa
*4* - Nada por enquanto`,
      ],
      shown: 'saí',
    },
    {
      answered: [
        `Certo, não registrei nada.
➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.

${farewell}`,
      ],
      shown: '4',
    },
    {
      answered: [
        `${greeting}

⚠️ *Falta a baixa desta parada.* Você chegou às ${at} e ainda não registrou a entrega.
*Parada 1 de 3*
*NF 17234* · R$ 1.234,56
🏪 *PADARIA SOL NASCENTE*
🏢 Contratante: Distribuidora Aurora
📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000
📦 3 volumes

*O que você quer fazer agora?*
*1* - Entreguei _(mande a foto do canhoto)_
*2* - Não entreguei
*3* - Sair para outra parada sem dar a baixa
*4* - Nada por enquanto`,
      ],
      shown: '@bot saí',
    },
    {
      answered: [
        `📍 *NF 17234:* se puder, compartilhe a localização da entrega (clipe 📎 → Localização). _Se não tiver, responda pular._`,
      ],
      shown: '1',
    },
    {
      answered: [
        `Ok, sem esse item.\n\n📸 *NF 17234:* mande a foto do canhoto assinado. _Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `Ok, sem esse item.\n\n✅ *NF 17234 pronta para fechar.*
🏢 Contratante: Distribuidora Aurora
👤 Cliente: PADARIA SOL NASCENTE
🏠 Endereço: RUA DAS FLORES, 100, RIBEIRAO PRETO, SP
💰 Valor da nota: *R$ 1.234,56*

📍 Localização: não enviada

*Confirma a entrega?*
*1* - Sim ✅
*2* - Não ❌`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `*NF 17234 entregue.* Parada concluída. ✅\n\n➡️ *Próxima parada*
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume
📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~${eta} (25 min)_

*O que você quer fazer agora?*
*1* - Seguir para ela 🚚
*2* - Escolher outra da lista
*3* - Nada por enquanto`,
      ],
      shown: '1',
    },
    {
      answered: [
        `↩️ *Pedido cancelado.* Nada foi registrado.
➡️ _Próximo passo:_ quando quiser, marque o bot de novo.`,
      ],
      shown: 'cancelar',
    },
    {
      answered: [
        `${greeting}

⚠️ *A entrega da NF 17234 já foi registrada* às ${at}.

➡️ *Próxima parada*
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume
📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~${eta} (25 min)_

*O que você quer fazer agora?*
*1* - Seguir para ela 🚚
*2* - Escolher outra da lista
*3* - Nada por enquanto`,
      ],
      shown: '@bot entreguei 17234',
    },
    {
      answered: [
        `*Qual parada?* _Responda com o número da opção ou da nota:_
*1* - NF 17235 · MERCADO LUA CHEIA
*2* - NF 17236 · ACOUGUE ESTRELA`,
      ],
      shown: '2',
    },
    {
      answered: [`📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`],
      shown: '2',
    },
    {
      answered: [
        `⚠️ *A próxima no roteiro é a parada 2 (NF 17235 — MERCADO LUA CHEIA).* Quer mesmo iniciar a parada 3?
*1* - Sim, a 3
*2* - Não, a 2`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `*Saída registrada* 🚚
*Parada 3 de 3*
*NF 17236* · R$ 10,00
🏪 *ACOUGUE ESTRELA*
🏢 Contratante: Distribuidora Aurora
📍 RUA SETE, 7, CRAVINHOS, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.3400000,-47.7300000
📦 12 volumes
➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '1',
    },
    {
      answered: [
        `${greeting}

📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `*Chegada registrada* 📍
*Parada 3 de 3*
*NF 17236* · R$ 10,00
🏪 *ACOUGUE ESTRELA*
🏢 Contratante: Distribuidora Aurora
📍 RUA SETE, 7, CRAVINHOS, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.3400000,-47.7300000
📦 12 volumes para entregar
➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.
🔜 _Depois desta:_ *NF 17235* · MERCADO LUA CHEIA – SERTAOZINHO`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada nesta parada já foi registrada* às ${at}.
*Parada 3 de 3*
*NF 17236* · R$ 10,00
🏪 *ACOUGUE ESTRELA*
🏢 Contratante: Distribuidora Aurora
📍 RUA SETE, 7, CRAVINHOS, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.3400000,-47.7300000
📦 12 volumes

*O que você quer fazer agora?*
*1* - Entreguei _(mande a foto do canhoto)_
*2* - Não entreguei
*3* - Abrir ocorrência
*4* - Nada por enquanto`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `(fluxo de ocorrência da NF 17236)

${farewell}`,
      ],
      shown: '3',
    },
    {
      answered: [
        `${greeting}

⚠️ *A chegada nesta parada já foi registrada* às ${at}.
*Parada 3 de 3*
*NF 17236* · R$ 10,00
🏪 *ACOUGUE ESTRELA*
🏢 Contratante: Distribuidora Aurora
📍 RUA SETE, 7, CRAVINHOS, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.3400000,-47.7300000
📦 12 volumes

*O que você quer fazer agora?*
*1* - Entreguei _(mande a foto do canhoto)_
*2* - Não entreguei
*3* - Abrir ocorrência
*4* - Nada por enquanto`,
      ],
      shown: '@bot cheguei',
    },
    {
      answered: [
        `*Por que a NF 17236 não foi entregue?*
*1* - 🚪 Destinatário ausente
*2* - 🙅 Recusou receber
*3* - 📍 Endereço não achado
*4* - 📦 Carga avariada
*5* - 🔒 Local fechado`,
      ],
      shown: 'não entreguei 17236',
    },
    {
      answered: [
        `*NF 17236 não entregue* ↩️\n\n➡️ *Próxima parada*
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume

*O que você quer fazer agora?*
*1* - Seguir para ela 🚚
*2* - Escolher outra da lista
*3* - Nada por enquanto`,
      ],
      shown: '2',
    },
    {
      answered: [`📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`],
      shown: 'saí',
    },
    {
      answered: [
        `*Saída registrada* 🚚
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume
📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~${eta} (25 min)_
➡️ _Próximo passo:_ quando chegar, mande *cheguei*.`,
      ],
      shown: '📍 (localização)',
    },
    {
      answered: [
        `${greeting}

⚠️ *A saída para esta parada já foi registrada* às ${at}.
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume
📏 *12,3 km* do seu último ponto · ⏱️ _chegada prevista ~${eta} (25 min)_

*O que você quer fazer agora?*
*1* - Cheguei
*2* - Abrir ocorrência
*3* - Nada por enquanto`,
      ],
      shown: '@bot saí',
    },
    {
      answered: [`📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`],
      shown: '1',
    },
    {
      answered: [
        `*Chegada registrada* 📍
*Parada 2 de 3*
*NF 17235* · R$ 99,90
🏪 *MERCADO LUA CHEIA*
🏢 Contratante: Distribuidora Aurora
📍 AVENIDA BRASIL, 2500, SERTAOZINHO, SP
🗺️ https://www.google.com/maps/search/?api=1&query=-21.1400000,-47.9900000
📦 1 volume para entregar
➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `${greeting}

📍 *NF 17235:* se puder, compartilhe a localização da entrega (clipe 📎 → Localização). _Se não tiver, responda pular._`,
      ],
      shown: '@bot entreguei 17235',
    },
    {
      answered: [
        `Ok, sem esse item.\n\n📸 *NF 17235:* mande a foto do canhoto assinado. _Se não tiver, responda pular._`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `Ok, sem esse item.\n\n✅ *NF 17235 pronta para fechar.*
🏢 Contratante: Distribuidora Aurora
👤 Cliente: MERCADO LUA CHEIA
🏠 Endereço: AVENIDA BRASIL, 2500, SERTAOZINHO, SP
💰 Valor da nota: *R$ 99,90*

📍 Localização: não enviada

*Confirma a entrega?*
*1* - Sim ✅
*2* - Não ❌`,
      ],
      shown: 'pular',
    },
    {
      answered: [
        `*NF 17235 entregue.* Viagem concluída. 🏁\n\n🏁 *Rota concluída:* todas as paradas fechadas.

${farewell}`,
      ],
      shown: '1',
    },
  ]
}
