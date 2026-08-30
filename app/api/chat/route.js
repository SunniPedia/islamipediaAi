import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

export async function POST(req) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  if (!supabaseUrl || !supabaseKey || !geminiKey) {
    return Response.json({ answer: "Server ENV missing. Vercel এ ৩ টা Key বসান।" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const genAI = new GoogleGenerativeAI(geminiKey)

  const { question } = await req.json()

  // 1. আপনার মডেল - gemini-embedding-2
  const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-2" })
  const embeddingResult = await embedModel.embedContent(question)

  const { data: docs } = await supabase.rpc('match_docs', {
    query_embedding: embeddingResult.embedding.values,
    match_count: 4
  })

  const context = docs?.map(d => d.content).join("\n---\n") || "No context found"

  // 2. আপনার মডেল - gemini-3.7-flash
  const chatModel = genAI.getGenerativeModel({ model: "gemini-3.7-flash" })
  
  const prompt = `তুমি islamiPedia AI। শুধু নিচের Context থেকে উত্তর দাও। নিজে থেকে হাদিস/আয়াত বানিও না। বাংলায় উত্তর দাও, শেষে রেফারেন্স দাও।
  Context: ${context}
  Question: ${question}`

  const result = await chatModel.generateContent(prompt)

  return Response.json({ answer: result.response.text() })
}