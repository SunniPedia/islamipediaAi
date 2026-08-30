import glob
import os
import time
from google import genai
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY").strip()
GEMINI_KEY = os.getenv("GEMINI_API_KEY").strip()

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = genai.Client(api_key=GEMINI_KEY)


def chunk_text(text, size=400):
  words = text.split()
  for i in range(0, len(words), size):
    yield " ".join(words[i : i + size])


MODEL_NAME = "text-embedding-004"

for filepath in glob.glob("data/*.txt"):
  print(f"Processing {filepath}")
  with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()
    for chunk in chunk_text(text):
      if not chunk.strip():
        continue
      for _ in range(3):
        try:
          result = client.models.embed_content(
              model=MODEL_NAME, contents=chunk
          )
          emb = (
              result.embeddings[0].values
              if hasattr(result, "embeddings")
              else result.embedding.values
          )
          supabase.table("islamic_docs").insert({
              "content": chunk,
              "metadata": {"source": os.path.basename(filepath)},
              "embedding": emb,
          }).execute()
          break
        except Exception as e:
          print(f"Retry due to {e}")
          time.sleep(2)

print("All Done")
