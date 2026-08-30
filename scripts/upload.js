const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function run() {
  console.log("ডাটা পড়া শুরু হচ্ছে...");
  
  // আপনার টেক্সট ফাইলের সঠিক পাথ (Path)
  const text = fs.readFileSync('data/your_file.txt', 'utf8'); 

  // প্যারাগ্রাফ অনুযায়ী ভাগ করা
  const chunks = text.split("\n\n").filter(c => c.trim().length > 0);

  // Embedding Model কল করা (মডেল নেম সঠিক ফরম্যাটে)
  const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    
    // SDK অনুযায়ী সঠিক পেলোড স্ট্রাকচার
    const result = await model.embedContent({
      content: { parts: [{ text: chunkText }] }
    });
    
    const embedding = result.embedding.values;

    const { error } = await supabase.from('documents').insert({
      content: chunkText,
      embedding: embedding
    });

    if (error) {
      console.error(`Error in chunk ${i + 1}:`, error);
    } else {
      console.log(`প্যারাগ্রাফ ${i + 1}/${chunks.length} আপলোড হয়েছে!`);
    }
  }
  console.log("সব তথ্য সফলভাবে Supabase-এ আপলোড সম্পন্ন!");
}

run();
