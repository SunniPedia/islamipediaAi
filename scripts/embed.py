import os, glob
from supabase import create_client
from google import genai

SUPABASE_URL = os.getenv("SUPABASE_URL").strip().rstrip('/')
SUPABASE_KEY = os.getenv("SUPABASE_KEY").strip()
GEMINI_KEY = os.getenv("GEMINI_API_KEY").strip()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key=GEMINI_KEY)

def chunk_text(text, size=500):
    words = text.split()
    for i in range(0, len(words), size):
        yield " ".join(words[i:i+size])

for filepath in glob.glob("data/*.txt"):
    print(f"Processing {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        for chunk in chunk_text(f.read()):
            if not chunk.strip(): continue
            result = client.models.embed_content(
                model="text-embedding-004",
                contents=chunk
            )
            emb = result.embeddings[0].values
            supabase.table("islamic_docs").insert({
                "content": chunk,
                "metadata": {"source": os.path.basename(filepath)},
                "embedding": emb
            }).execute()
print("All Done")
