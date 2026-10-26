/**
 * Knowledge AI diagnostics. Measures REAL latency per step and shows raw retrieval similarities,
 * so the similarity threshold can be tuned from data instead of guessed.
 *
 *   npx tsx --env-file=.env.local scripts/rag-diagnose.ts
 *   npx tsx --env-file=.env.local scripts/rag-diagnose.ts --generate "What is space?" "What does our documentation say about fire detection?"
 *   RAG_THINKING_LEVEL=low npx tsx --env-file=.env.local scripts/rag-diagnose.ts --generate
 *
 * Prints titles, similarities and timings only (no secrets, no document text).
 */
import { RAG_CONFIG, GENERATION_MODEL, embedText, generateAnswer, retrieveDocuments, supabase } from "@/lib/rag";

const DEFAULTS = [
  "What is space?",
  "What is a black hole?",
  "Explain remote sensing in simple words.",
  "How does active fire detection work?",
  "What is the capital of France?",
  "Give me a pizza recipe",
];

type Row = { title?: string; similarity?: number };
const ms = (n: number) => `${Math.round(n)} ms`;

async function main() {
  const args = process.argv.slice(2);
  const generate = args.includes("--generate");
  const questions = args.filter((a) => !a.startsWith("--"));
  const list = questions.length ? questions : DEFAULTS;
  console.log(`generation model: ${GENERATION_MODEL} | min similarity: ${RAG_CONFIG.minSimilarity} | thinking level: ${RAG_CONFIG.thinkingLevel ?? "model default"} | max output tokens: ${RAG_CONFIG.maxOutputTokens}\n`);

  for (const q of list) {
    console.log(`Q: ${q}`);
    let t = performance.now();
    let embedding: number[];
    try {
      embedding = await embedText(q);
    } catch (e) {
      console.log(`  embedding FAILED: ${(e as Error).message}\n`);
      continue;
    }
    const embedMs = performance.now() - t;

    t = performance.now();
    const { data, error } = await supabase.rpc("match_terra_documents", { query_embedding: embedding, match_count: 10 });
    const rpcMs = performance.now() - t;
    if (error) {
      console.log(`  retrieval FAILED: ${error.code ?? ""} ${error.message}\n`);
      continue;
    }
    const rows = ((data ?? []) as Row[]).sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    console.log(`  embed ${ms(embedMs)} | supabase rpc ${ms(rpcMs)} | ${rows.length} rows (the rpc's own threshold may already hide weaker matches)`);
    rows.forEach((r, i) => console.log(`   ${String(i + 1).padStart(2)}. ${(r.similarity ?? 0).toFixed(3)}  ${r.title ?? "(no title)"}${(r.similarity ?? 0) >= RAG_CONFIG.minSimilarity ? "" : "   <- below threshold, not sent to Gemini"}`));

    if (generate) {
      const retrieval = await retrieveDocuments(q);
      try {
        const g = await generateAnswer(q, retrieval.docs, []);
        const u = g.usage;
        console.log(`  generate ${ms(g.generateMs)} | finish ${g.finishReason} | tokens: prompt ${u.promptTokens ?? "?"}, answer ${u.outputTokens ?? "?"}, THINKING ${u.thoughtsTokens ?? "?"} | basis ${g.basis} | used sources ${JSON.stringify(g.usedSources)}`);
        console.log(`  answer: ${g.answer.slice(0, 200).replace(/\n/g, " ")}${g.answer.length > 200 ? "…" : ""}`);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        console.log(`  generate FAILED: ${err.code ?? ""} ${err.message ?? ""}`);
      }
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error("diagnose failed:", (e as Error).message);
  process.exit(1);
});