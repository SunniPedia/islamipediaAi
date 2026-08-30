import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'প্রশ্ন লিখুন।' });

    const apiKey = process.env.GEMINI_API_KEY;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ১. ইউজার প্রশ্নের Vector তৈরি
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
    const embedRes = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: query }] }
      })
    });
    const embedData = await embedRes.json();
    const queryEmbedding = embedData.embedding?.values;

    if (!queryEmbedding) throw new Error("Embedding তৈরি করা যায়নি।");

    // ২. Supabase থেকে সেরা ৩টি প্রাসঙ্গিক প্যারাগ্রাফ বের করা
    const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 3
    });

    if (matchError) throw matchError;

    const contextData = matchedDocs.map(doc => doc.content).join("\n\n---\n\n");

    // ৩. gemini-3.5-flash-lite মডেলে ডাটা পাঠানো
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: query }] }],
        systemInstruction: {
          parts: [{
            text: `আপনি একটি ইসলামিক এআই সহকারী (islamiPediaAI)। নিচে দেওয়া [প্রাসঙ্গিক তথ্যভাণ্ডার] থেকে প্রশ্নের সঠিক উত্তর দিন। তথ্য না পাওয়া গেলে বিনীতভাবে বলুন যে আপনার ডাটাবেজে এই তথ্যটি নেই।

            [প্রাসঙ্গিক তথ্যভাণ্ডার]:
            ${contextData || "কোনো প্রাসঙ্গিক তথ্য পাওয়া যায়নি।"}`
          }]
        }
      })
    });

    const geminiData = await geminiRes.json();
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "উত্তর তৈরি করা সম্ভব হয়নি।";

    return res.status(200).json({ answer });

  } catch (error) {
    console.error("RAG Error:", error);
    return res.status(500).json({ error: error.message || "সার্ভারে সমস্যা হয়েছে।" });
  }
}
