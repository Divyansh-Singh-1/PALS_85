const ALLOWED_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "allam-2-7b"];
const MAX_MESSAGES_CHARS = 12000;

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured on server" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const messages = body.messages;
    const model = body.model;

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof model !== "string" || !ALLOWED_MODELS.includes(model)) {
      return new Response(JSON.stringify({ error: "Invalid or unsupported model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg === "object" && msg !== null) {
        const m = msg as Record<string, unknown>;
        if (typeof m.content === "string") {
          totalChars += m.content.length;
        }
      }
    }

    if (totalChars > MAX_MESSAGES_CHARS) {
      return new Response(JSON.stringify({ error: "Request too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: body.messages,
        model: body.model,
        response_format: body.response_format,
        temperature: body.temperature,
        max_tokens: body.max_tokens,
      }),
    });

    const data = await groqRes.text();
    return new Response(data, {
      status: groqRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
