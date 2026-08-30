import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export async function POST(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!supabaseUrl || !supabaseKey || !geminiKey) {
    return Response.json(
        { answer: 'Server ENV missing. Vercel এ ৩ টা Key বসান।' },
        { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  const { question } = await req.json();

  const embeddingResult = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: question,
  });

  const { data: docs } = await supabase.rpc('match_docs', {
    query_embedding: embeddingResult.embedding.values,
    match_count: 4,
  });

  const context =
      docs?.map((d) => d.content).join('\n---\n') || 'No context found';

  const prompt = `তুমি islamiPedia AI। শুধু নিচের Context থেকে উত্তর দাও। নিজে থেকে হাদিস/আয়াত বানিও না। বাংলায় উত্তর দাও, শেষে রেফারেন্স দাও।
  Context: ${context}
  Question: ${question}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  return Response.json({ answer: response.text });
}
