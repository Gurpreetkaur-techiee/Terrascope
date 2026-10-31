
import { NextRequest } from "next/server";



const SYSTEM_PROMPT = `
You are Terra, the AI space and Earth-observation assistant inside TerraScope.

Your expertise includes:
- Astronomy, planets, stars, galaxies and the solar system.
- Satellites, satellite orbits, sensors and remote sensing.
- Earth observation, climate, clouds, vegetation and land use.
- NASA, ESA, ISRO missions and space exploration.
- Wildfire monitoring, thermal anomalies and satellite fire detection.
- GIS, geospatial data and change detection.

Conversation rules:
1. Give helpful, accurate, conversational answers.
2. Explain difficult scientific concepts in simple language.
3. Support follow-up questions using the conversation history.
4. If the user asks about TerraScope, explain its dashboard features.
5. Never claim that sample dashboard data is live data.
6. Never invent current satellite readings, fire detections or mission updates.
7. You do not have live internet or satellite-data access unless explicitly
   provided in the conversation. Clearly explain this limitation.
8. If unsure about a scientific fact, say so instead of inventing an answer.
9. Use headings or bullet points when they improve readability.
10. Be friendly, concise and curious, like a real mission assistant.
`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Groq API key is missing on the server." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const messages = body.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 30
    ) {
      return Response.json(
        { error: "Invalid chat messages." },
        { status: 400 }
      );
    }

    const validMessages = messages.every(
      (message: { role?: string; content?: string }) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    );

    if (!validMessages) {
      return Response.json(
        { error: "Invalid message format." },
        { status: 400 }
      );
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          temperature: 0.5,
          max_completion_tokens: 1200,
          stream: true,
        }),
        signal: request.signal,
      }
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errorText);

      return Response.json(
        {
          error:
            groqResponse.status === 429
              ? "Terra is receiving too many requests. Please try again shortly."
              : "Terra could not connect to the AI service. Please try again.",
        },
        { status: groqResponse.status }
      );
    }

    if (!groqResponse.body) {
      return Response.json(
        { error: "No response stream received from Groq." },
        { status: 502 }
      );
    }

    return new Response(groqResponse.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    console.error("Terra chat route error:", error);

    return Response.json(
      { error: "Something went wrong while connecting Terra." },
      { status: 500 }
    );
  }
}
