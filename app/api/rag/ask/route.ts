
import { NextRequest, NextResponse } from "next/server";
import { ai, embedText, supabase } from "@/lib/rag";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question =
      typeof body.question === "string" ? body.question.trim() : "";

    if (!question || question.length > 2000) {
      return NextResponse.json(
        { error: "Please provide a question (maximum 2000 characters)." },
        { status: 400 }
      );
    }

    // 1. Convert the question into a vector.
    const embedding = await embedText(question);

    // 2. Retrieve relevant documents from Supabase.
    const { data: documents, error } = await supabase.rpc(
      "match_terra_documents",
      {
        query_embedding: embedding,
        match_count: 4,
      }
    );

    if (error) {
      console.error("Supabase retrieval failed:", error);
      return NextResponse.json(
        { error: "Could not retrieve reference documents." },
        { status: 500 }
      );
    }

    const context = (documents ?? [])
      .map(
        (doc: {
          title: string;
          content: string;
          source: string;
          similarity: number;
        }) =>
          `Title: ${doc.title}\nSource: ${doc.source}\nContent: ${doc.content}`
      )
      .join("\n\n");

    // 3. Ask Gemini to answer using retrieved context.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are TerraScope, an Earth-observation intelligence assistant.

Answer the user's question clearly and accurately.
Use the reference context below when it is relevant.
Do not invent facts or claim that a hotspot proves a wildfire.
If the context does not contain enough information, say so.
Distinguish reference knowledge from live observations.

REFERENCE CONTEXT:
${context || "No matching reference documents were found."}

USER QUESTION:
${question}
`,
    });

    return NextResponse.json({
      answer: response.text ?? "I could not generate an answer.",
      sources: (documents ?? []).map(
        (doc: { title: string; source: string; similarity: number }) => ({
          title: doc.title,
          source: doc.source,
          similarity: doc.similarity,
        })
      ),
    });
  } catch (error) {
    console.error("TerraScope RAG request failed:", error);

    return NextResponse.json(
      { error: "The AI request failed. Check the terminal for details." },
      { status: 500 }
    );
  }
}
