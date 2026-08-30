import os, glob
from supabase import create_client
import google.generativeai as genai

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
genai.configure(api_key=GEMINI_KEY)

def chunk_text(text, size=400):
    words = text.split()
    for i in range(0, len(words), size):
        yield " ".join(words[i:i+size])

for filepath in glob.glob("data/*.txt"):
    print(f"Processing {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()
        for chunk in chunk_text(text):
            emb = genai.embed_content(
                model="models/gemini-embedding-2",
                content=chunk
            )['embedding']
            supabase.table("islamic_docs").insert({
                "content": chunk,
                "metadata": {"source": os.path.basename(filepath)},
                "embedding": emb
            }).execute()
print("All Done")
