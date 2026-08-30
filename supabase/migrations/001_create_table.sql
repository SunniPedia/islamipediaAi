-- Vector চালু করা
create extension if not exists vector;

-- টেবিল
create table if not exists islamic_docs (
  id bigserial primary key,
  content text not null,
  metadata jsonb,
  embedding vector(768)
);

-- Search function - এটা RAG এর প্রাণ
create or replace function match_docs(
  query_embedding vector(768),
  match_count int
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select
    id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from islamic_docs
  order by embedding <=> query_embedding
  limit match_count;
$$;
