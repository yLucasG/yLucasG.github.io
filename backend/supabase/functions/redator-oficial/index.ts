// NENHUM IMPORT AQUI EM CIMA

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // 1. Configuração de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Verifica a chave
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')
    if (!GROQ_API_KEY) {
      console.error("ERRO: Chave GROQ_API_KEY não encontrada nos Secrets")
      throw new Error('Chave de API não configurada')
    }

    const { texto } = await req.json()
    console.log("Texto recebido:", texto)

    // 3. Chama a IA (MODELO ATUALIZADO AQUI)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // MUDANÇA AQUI: Trocamos o modelo antigo pelo novo Llama 3.3
        model: 'llama-3.3-70b-versatile', 
        messages: [
          { role: 'system', content: "Reescreva o texto em linguagem policial formal, culta e impessoal (PMPE). Seja direto, corrija erros e mantenha o sentido." },
          { role: 'user', content: texto }
        ],
        temperature: 0.3
      }),
    })

    const data = await response.json()

    // Verificação de erro vindo da Groq
    if (data.error) {
      console.error("Erro vindo da Groq:", data.error)
      throw new Error(`Erro na IA: ${data.error.message}`)
    }

    const textoMelhorado = data.choices[0].message.content
    console.log("Sucesso! Texto gerado.")

    return new Response(JSON.stringify({ resultado: textoMelhorado }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("ERRO GERAL:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})