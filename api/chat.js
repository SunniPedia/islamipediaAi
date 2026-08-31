// pages/api/chat.js
//
// Streaming RAG endpoint for islamiPedia AI.
//
// Flow:
//   1. Embed the user's question with Gemini embeddings.
//   2. Find the closest matching documents in Supabase (pgvector).
//   3. Push those matched documents to the client immediately as a
//      "sources" SSE event, so the UI can show references right away.
//   4. Call Gemini's *streaming* generateContent endpoint and forward
//      each text delta to the client as a "chunk" SSE event, so the
//      answer appears word-by-word instead of all at once.
//   5. Send a final "done" event with the complete answer text.
//
// Error messages shown to the user:
//   - If the failure looks like an API/usage-quota limit (HTTP 429,
//     "RESOURCE_EXHAUSTED", "quota", "rate limit" in the provider's
//     response), we show a friendly Bangla message asking for donations
//     to help scale up the service, with the bKash number.
//   - Any other failure shows a generic, non-technical Bangla message
//     (we never leak raw provider error text to the client).
//
// The response is a text/event-stream (Server-Sent Events) stream, with
// lines shaped like:
//   event: sources
//   data: {"sources":[...]}
//
//   event: chunk
//   data: {"text":"..."}
//
//   event: done
//   data: {"answer":"..."}
//
// If something fails after streaming has already started, an "error"
// event is sent instead of an HTTP error code, since headers are
// already committed to the client at that point.

import { createClient } from '@supabase/supabase-js';

// Shown when the failure looks like an API/usage quota limit being hit.
const LIMIT_MESSAGE =
  'আমাদের সার্ভার সীমিত থাকাতে সমস্যাটি দিচ্ছে। ইসলামী পিডিয়া এ আই-কে সমৃদ্ধ করতে অনুদান দিয়ে সহযোগিতা করুন।\n\n' +
  '**বিকাশ (পার্সোনাল):** 01537144153';

// Shown for any other, non-quota failure. Kept generic/non-technical on purpose.
const GENERIC_MESSAGE = 'দুঃখিত, এই মুহূর্তে উত্তর দেওয়া সম্ভব হয়নি। একটু পরে আবার চেষ্টা করুন।';

// Heuristic: does this status code / response body look like a quota or
// rate-limit failure from Gemini, Supabase, or any upstream provider?
function isQuotaError(status, bodyText) {
  if (status === 429) return true;
  if (!bodyText) return false;
  const t = String(bodyText).toLowerCase();
  return (
    t.includes('resource_exhausted') ||
    t.includes('quota') ||
    t.includes('rate limit') ||
    t.includes('rate_limit_exceeded') ||
    t.includes('too many requests')
  );
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Flush immediately if the runtime exposes a flush method (e.g. compression middlewares).
  if (typeof res.flush === 'function') res.flush();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'প্রশ্ন লিখুন।' });

  const apiKey = process.env.GEMINI_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!apiKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'সার্ভার Environment Variables ঠিকভাবে সেট করা নেই।' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Embed the user's question.
    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
    const embedRes = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: query }] },
        taskType: 'RETRIEVAL_QUERY'
      })
    });

    if (!embedRes.ok) {
      const errText = await embedRes.text().catch(() => '');
      console.error('Embed API error:', embedRes.status, errText);
      const msg = isQuotaError(embedRes.status, errText) ? LIMIT_MESSAGE : GENERIC_MESSAGE;
      return res.status(embedRes.status === 429 ? 429 : 500).json({ error: msg });
    }

    const embedData = await embedRes.json();
    const queryEmbedding = embedData.embedding?.values;

    if (!queryEmbedding) {
      console.error('Embed API response:', JSON.stringify(embedData));
      return res.status(500).json({ error: GENERIC_MESSAGE });
    }

    // 2. Find the closest matching documents.
    const { data: matchedDocs, error: matchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: 3
    });

    if (matchError) {
      console.error('Supabase match_documents error:', matchError);
      const msg = isQuotaError(null, matchError.message || '') ? LIMIT_MESSAGE : GENERIC_MESSAGE;
      return res.status(500).json({ error: msg });
    }

    const contextData = (matchedDocs || []).map((doc) => doc.content).join('\n\n---\n\n');

    // Build a lightweight, client-safe sources list (title + short snippet only).
    const sources = (matchedDocs || []).map((doc, idx) => ({
      id: doc.id ?? idx,
      title: doc.title || doc.source || doc.metadata?.title || `রেফারেন্স ${idx + 1}`,
      snippet: (doc.content || '').slice(0, 220).trim(),
      similarity: typeof doc.similarity === 'number' ? Number(doc.similarity.toFixed(3)) : null
    }));

    // --- From here on, we commit to a streaming response. ---
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no' // disable reverse-proxy buffering (e.g. nginx) so chunks flush immediately
    });

    // 3. Send sources first so the UI can render references while the model is still writing.
    sendEvent(res, 'sources', { sources });

    // 4. Call Gemini's streaming endpoint.
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: query }] }],
systemInstruction: {
  parts: [{
    text: `আপনি একটি ইসলামিক এআই সহকারী (islamiPediaAI)। আপনার কাজ নিচে দেওয়া [ইসলামী বিশ্বকোষ]-এর তথ্যের ভিত্তিতে প্রশ্নের সঠিক, স্পষ্ট এবং সুবিন্যস্ত উত্তর দেওয়া।

সাধারণ নিয়ম:
- ব্যবহারকারী সালাম দিলে সালামের জবাব দিন; নিজে থেকে সালাম দিয়ে শুরু করবেন না।
- শুধু [ইসলামী বিশ্বকোষ]-এ থাকা তথ্যের ভিত্তিতে উত্তর দিন। প্রাসঙ্গিক তথ্য না পেলে বিনীতভাবে জানান যে আপনার ডাটাবেজে এই তথ্যটি নেই — অনুমান করে বা বাইরের জ্ঞান থেকে উত্তর তৈরি করবেন না।
- ভাষা সহজ, শ্রদ্ধাশীল এবং বাংলায় রাখুন।

ফরম্যাটিং নির্দেশনা (উত্তর সবসময় এভাবে সাজান):
- মূল বিষয় বা সংজ্ঞা দিয়ে উত্তর শুরু করুন — ১-২ লাইনের সংক্ষিপ্ত ভূমিকা।
- গুরুত্বপূর্ণ শব্দ, পরিভাষা বা সিদ্ধান্তসূচক অংশ **বোল্ড** করুন।
- একাধিক পয়েন্ট, শর্ত, প্রকারভেদ বা ধাপ থাকলে অবশ্যই বুলেট লিস্ট (- আইটেম) বা প্রয়োজনে নম্বরযুক্ত লিস্ট (১. আইটেম) ব্যবহার করুন — বড় প্যারাগ্রাফে সব একসাথে লিখবেন না।
- কুরআনের আয়াত বা হাদিস উদ্ধৃত করার সময় অবশ্যই ব্লককোট ব্যবহার করুন (> দিয়ে শুরু করে), এবং সম্ভব হলে সূরা/হাদিসের রেফারেন্স (নাম, নম্বর) নিচে ছোট করে উল্লেখ করুন।
- একাধিক দিক বা উপবিষয় থাকলে সংক্ষিপ্ত সাব-হেডিং (### শিরোনাম) দিয়ে ভাগ করুন, যাতে উত্তর স্ক্যান করে পড়া সহজ হয়।
- জটিল বা দীর্ঘ উত্তরের শেষে ১-২ লাইনের সংক্ষিপ্ত সারসংক্ষেপ দিন।
- অপ্রয়োজনীয় ভূমিকা, পুনরাবৃত্তি বা "আমি একটি AI" জাতীয় বাক্য এড়িয়ে চলুন — সরাসরি বিষয়বস্তুতে যান।
- উত্তর যেন পড়তে গোছানো, পরিষ্কার এবং একটি বিশ্বকোষীয় নিবন্ধের মতো নির্ভরযোগ্য মনে হয়।

[ইসলামী বিশ্বকোষ]:
${contextData || 'কোনো প্রাসঙ্গিক তথ্য পাওয়া যায়নি।'}`
  }]
}
      })
    });

    if (!geminiRes.ok || !geminiRes.body) {
      const errText = await geminiRes.text().catch(() => '');
      console.error('Gemini stream error:', geminiRes.status, errText);
      const msg = isQuotaError(geminiRes.status, errText) ? LIMIT_MESSAGE : GENERIC_MESSAGE;
      sendEvent(res, 'error', { message: msg });
      return res.end();
    }

    // 5. Pipe Gemini's own SSE stream, forwarding just the text deltas.
    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullAnswer = '';
    let sawQuotaInStream = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the last (possibly partial) line for the next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);

          // Some errors arrive as a normal SSE data payload rather than a bad HTTP status.
          if (parsed?.error) {
            console.error('Gemini mid-stream error:', JSON.stringify(parsed.error));
            if (isQuotaError(parsed.error.code, parsed.error.message || parsed.error.status || '')) {
              sawQuotaInStream = true;
            }
            continue;
          }

          const textPart = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textPart) {
            fullAnswer += textPart;
            sendEvent(res, 'chunk', { text: textPart });
          }
        } catch {
          // Ignore partial/malformed JSON fragments that span chunk boundaries.
        }
      }
    }

    if (!fullAnswer) {
      sendEvent(res, 'error', { message: sawQuotaInStream ? LIMIT_MESSAGE : GENERIC_MESSAGE });
    } else {
      sendEvent(res, 'done', { answer: fullAnswer });
    }
    return res.end();

  } catch (error) {
    console.error('RAG Error:', error);
    const msg = isQuotaError(error?.status, error?.message || '') ? LIMIT_MESSAGE : GENERIC_MESSAGE;
    if (!res.headersSent) {
      return res.status(500).json({ error: msg });
    }
    try {
      sendEvent(res, 'error', { message: msg });
    } catch {}
    return res.end();
  }
}

// Keep the default Node.js runtime (not Edge) so `res.write` streaming works as written above.
export const config = {
  api: { bodyParser: true }
};
