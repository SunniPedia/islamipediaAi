import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export async function POST(req) {
  const { question } = await req.json()

  const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" })
  const embeddingResult = await embedModel.embedContent(question)

  const { data: docs } = await supabase.rpc('match_docs', {
    query_embedding: embeddingResult.embedding.values,
    match_count: 4
  })

  const context = docs?.map(d => d.content).join("\n---\n") || "No context found"

  const chatModel = genAI.getGenerativeModel({ model: "gemini-3.7-flash" })
  
  const prompt = `তুমি islamiPedia AI। শুধু নিচের Context থেকে উত্তর দাও। নিজে থেকে হাদিস/আয়াত বানিও না। বাংলায় উত্তর দাও, শেষে রেফারেন্স দাও।
  Context: ${context}
  Question: ${question}`

  const result = await chatModel.generateContent(prompt)

  return Response.json({ answer: result.response.text() })
}
