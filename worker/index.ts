/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const FEEDBACK_SCHEMA = `CREATE TABLE IF NOT EXISTS prototype_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  helpful_feature TEXT NOT NULL,
  feedback TEXT NOT NULL DEFAULT '',
  preorder_interest TEXT NOT NULL,
  contribution_amount INTEGER,
  consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function saveFeedback(request: Request, env: Env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "Invalid response" }, 400);

  const email = String(body.email || "").trim().slice(0, 200);
  const helpfulFeature = String(body.helpfulFeature || "").trim().slice(0, 80);
  const preorderInterest = String(body.preorderInterest || "").trim().slice(0, 40);
  const consent = body.consent === true;
  if (!/^\S+@\S+\.\S+$/.test(email) || !helpfulFeature || !preorderInterest || !consent) {
    return json({ error: "Please complete the required fields." }, 400);
  }

  const amountValue = Number(body.contributionAmount);
  const contributionAmount = Number.isFinite(amountValue) && amountValue >= 0 && amountValue <= 10000
    ? Math.round(amountValue)
    : null;

  await env.DB.prepare(FEEDBACK_SCHEMA).run();
  await env.DB.prepare(`INSERT INTO prototype_feedback
    (name, email, role, helpful_feature, feedback, preorder_interest, contribution_amount, consent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      String(body.name || "").trim().slice(0, 100),
      email,
      String(body.role || "").trim().slice(0, 100),
      helpfulFeature,
      String(body.feedback || "").trim().slice(0, 2000),
      preorderInterest,
      contributionAmount,
      1,
    ).run();

  return json({ ok: true });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/feedback") {
      return saveFeedback(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
