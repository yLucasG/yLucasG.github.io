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
    console.log("Texto original:", texto)

    // 3. Prompt Ajustado para RESUMO CURTO E TÉCNICO
    const systemPrompt = `
      Atue como um Oficial da Polícia Militar preenchendo uma ficha disciplinar.
      Sua missão: Transformar o relato informal do usuário em uma frase curta, técnica e formal para o campo 'MOTIVO'.
      
      Regras:
      1. Seja extremamente conciso (máximo 10 palavras).
      2. Use linguagem impessoal e culta (padrão RDPM).
      3. NÃO comece com "Informo que", "O aluno", "Trata-se de". Vá direto ao fato.
      4. Prefira estilo nominal. Ex: Em vez de "Ele chegou atrasado", use "Atraso injustificado à formatura".
      5. Corrija erros de português.
    `

    // 4. Chama a IA (Modelo Llama 3.3)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', 
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto }
        ],
        temperature: 0.1 // Baixei a temperatura para ela ser menos criativa e mais direta
      }),
    })

    const data = await response.json()

    if (data.error) {
      console.error("Erro vindo da Groq:", data.error)
      throw new Error(`Erro na IA: ${data.error.message}`)
    }

    const textoMelhorado = data.choices[0].message.content
    console.log("Texto gerado:", textoMelhorado)

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
