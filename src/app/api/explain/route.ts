import { anthropic } from "@ai-sdk/anthropic";
import { MODEL_ID } from "@/lib/agent/pricing";
import { explain } from "@/lib/explain/explain";
import { createQuestionBudget, parseExplainRequest } from "@/lib/explain/request";
import { loadReviewBatch } from "@/lib/review/batch";

/**
 * The live half of the Explain layer (PRD §9, agent 2).
 *
 * The panel's example questions are answered from a committed file and need no
 * key; this route answers a question nobody anticipated, which cannot be
 * pre-baked. Both go through the same `explain()`, the same read-only tools and
 * the same citation gate, so a typed question is answered by the same agent
 * whose behaviour the tests describe.
 *
 * POST only. Route Handlers are uncached for every method except GET, which is
 * what this needs: an answer is about a question, not about a URL.
 */

/**
 * A ceiling per server process, claimed BEFORE the model is called.
 *
 * This route is public and every call is billed, so the realistic accident is
 * somebody holding down enter. The spending limit on the API account is the
 * hard stop; this is what keeps an accident from reaching it. Per-process, so
 * it neither survives a restart nor coordinates across serverless instances,
 * deliberately crude rather than pretending to be a real rate limiter.
 */
const budget = createQuestionBudget(Number(process.env.EXPLAIN_MAX_QUESTIONS ?? 40));

const failure = (status: number, message: string) =>
  Response.json({ error: message }, { status });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(400, "That request was not JSON.");
  }

  let question: string;
  try {
    question = parseExplainRequest(body).question;
  } catch (error) {
    return failure(400, error instanceof Error ? error.message : "Ask a question first.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return failure(
      503,
      "Live answers are not configured on this deployment. The example questions below were recorded ahead of time and still work.",
    );
  }

  // Refused BEFORE the model is called. A budget checked afterwards has already
  // spent the money it exists to protect.
  if (!budget.take()) {
    return failure(
      429,
      "This deployment answers a limited number of live questions, and that limit has been reached. The example questions below still work.",
    );
  }

  // Every model call is logged (PRD §15.4), and this route holds to that
  // literally: without somewhere to write the audit row it declines to answer
  // rather than answering off the record. For an audit product an untraceable
  // answer is worth less than no answer.
  if (!process.env.DATABASE_URL) {
    return failure(
      503,
      "Live answers need the audit trail, and no database is configured. Nothing is answered off the record.",
    );
  }

  try {
    const { ensureBatchWithRecords } = await import("@/lib/audit/persist");
    const batchId = await ensureBatchWithRecords();
    const batch = loadReviewBatch();

    const result = await explain({
      model: anthropic(MODEL_ID),
      question,
      batch,
      batchId,
    });

    const { db, schema } = await import("@/lib/audit/client");
    await db.insert(schema.aiCalls).values(result.aiCall);

    return Response.json({
      answer: result.answer,
      // Already resolved against the batch on this side. The browser is never
      // asked to decide which citations are real.
      segments: result.segments,
      cited: result.cited,
      unknown: result.unknown,
      verdict: result.verdict,
      model: result.aiCall.model,
      promptVersion: result.aiCall.promptVersion,
      answeredAt: new Date().toISOString(),
      questionsLeft: budget.remaining(),
    });
  } catch (error) {
    // The message is not echoed back. It can carry a provider URL, a key
    // prefix or a connection string, and this route is public.
    console.error("explain route failed", error);
    return failure(500, "That question could not be answered. The recorded examples still work.");
  }
}
