// NENHUM IMPORT EXTERNO NECESSÁRIO NO DENO 2.x/SUPABASE ATUAL

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { dados, phone, apikey } = await req.json()

    // 1. MONTAGEM DO TEXTO (Padrão Militar)
    // Aqui usamos Template Literals (``) para manter a formatação exata
    const relatorio = `*🔰 SDS – PMPE – DGA – DEIP – APMP 🔰*

*RELATÓRIO DE PASSAGEM DE SERVIÇO DO AUXILIAR DO OFICIAL DE DIA – 1ª CIA*

📌 Oficial de Dia: ${dados.oficialDia}
📌 Auxiliar do Oficial de Dia: ${dados.auxiliar}
📌 Adjunto ao Auxiliar: ${dados.adjunto}

🗓 Data: ${dados.data}
⏰ Horário: 07h às 07h
🪖 Plantão: ${dados.plantao}

---

*🛡 ESCALA DE PERMANÊNCIA POR POSTO*
📍 Fiscalização dos Postos – Rondas Noturnas
* Auxiliar: ${dados.auxiliar}
* Adjunto: ${dados.adjunto}

---

*📍 DAG*
${dados.escalaDag || "Sem alterações na escala."}

---

*⭐ FATO OBSERVADO POSITIVAMENTE (FO+)*
${dados.foPositivos && dados.foPositivos.length > 0 
  ? dados.foPositivos.map(fo => `* ${fo.aluno}: ${fo.texto}`).join('\n') 
  : "* Sem alterações."}

*⚠️ ALTERAÇÕES DISCIPLINARES*
${dados.foNegativos && dados.foNegativos.length > 0 
  ? dados.foNegativos.map(fo => `* ${fo.aluno}: ${fo.texto}`).join('\n') 
  : "* Sem alterações."}

---

*📌 OBSERVAÇÕES*
* Total de presentes: ${dados.efetivoTotal}
* Controle de materiais: ${dados.materiais || "Sem alterações."}
* Ocorrências: ${dados.ocorrencias || "Sem alterações."}

---

📍 Paudalho – PE, ${new Date().toLocaleDateString('pt-BR')}

${dados.auxiliar}
Auxiliar do Oficial de Dia

🛡 “Nossa Presença, Sua Segurança.”`

    // 2. ENVIAR PARA O CALLMEBOT
    // Precisamos codificar o texto para URL (trocar espaços por %20, etc)
    const textoCodificado = encodeURIComponent(relatorio)
    
    // URL da API Gratuita
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${textoCodificado}&apikey=${apikey}`

    const response = await fetch(url)
    
    if (response.status !== 200) {
      throw new Error("Erro ao enviar mensagem no WhatsApp")
    }

    return new Response(JSON.stringify({ success: true, message: "Relatório Enviado!" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})