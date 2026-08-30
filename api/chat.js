// api/chat.js
export default async function handler(req, res) {
  // শুধুমাত্র POST রিকোয়েস্ট অ্যালাউ করা হবে
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'দয়া করে প্রশ্ন লিখুন।' });
    }

    // ১. গিটহাব থেকে সরাসরি আপনার txt ফাইলের Raw Data ফেচ (Fetch) করুন
    const githubRawUrl = "https://raw.githubusercontent.com/SunniPedia/islamipediaAi/main/data/your_file.txt"; 
    // ⚠️ আপনার আসল txt ফাইলের নাম অনুযায়ী 'your_file.txt' পরিবর্তন করুন

    const fileRes = await fetch(githubRawUrl);
    
    if (!fileRes.ok) {
      throw new Error("গিটহাব থেকে ডাটা ফাইল লোড করা সম্ভব হয়নি।");
    }

    const contextData = await fileRes.text();

    // ২. Vercel Environment Variable থেকে API Key নেওয়া
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY সেট করা নেই।' });
    }

    // ৩. Gemini 2.5 Flash-Lite REST Endpoint কল
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: query }]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text: `আপনি একটি অত্যন্ত সুনির্দিষ্ট ও মার্জিত ইসলামিক এআই সহকারী (islamiPediaAI)। আপনার প্রধান দায়িত্ব নিচে দেওয়া [তথ্য ভাণ্ডার] থেকে সঠিক উত্তর প্রদান করা। 

নিয়মাবলী:
১. শুধুমাত্র দেওয়া [তথ্য ভাণ্ডার]-এর তথ্যের উপর ভিত্তি করে প্রশ্নের উত্তর দিন।
২. যদি প্রশ্নটির উত্তর এই তথ্য ভাণ্ডারে না থাকে, তবে বিনীতভাবে বাংলা ভাষায় বলুন যে এই সংক্রান্ত তথ্য আপনার ডাটাবেজে পাওয়া যায়নি।
৩. নিজ থেকে মনগড়া বা বানিয়ে কোনো উত্তর দেবেন না।
৪. উত্তর সবসময় সহজ, স্পষ্ট ও সুন্দর বাংলায় গুছিয়ে লিখুন।

[তথ্য ভাণ্ডার]:
${contextData}`
            }
          ]
        }
      })
    });

    const data = await geminiRes.json();

    if (data.error) {
      throw new Error(data.error.message || "Gemini API থেকে সমস্যা দেখা দিয়েছে।");
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "কোনো উত্তর পাওয়া যায়নি।";

    return res.status(200).json({ answer });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ error: error.message || "সার্ভারে সমস্যা হয়েছে।" });
  }
}
