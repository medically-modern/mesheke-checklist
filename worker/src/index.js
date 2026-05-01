/**
 * Monday File Upload Proxy
 *
 * Receives file-upload requests from the mesheke-checklist app (which
 * lives at https://medically-modern.github.io/mesheke-checklist/) and
 * forwards them to Monday's file endpoint at api.monday.com/v2/file.
 *
 * Why this exists: Monday's GraphQL endpoint allows browser CORS, but
 * the file upload endpoint doesn't return the right CORS headers. So
 * we relay the request through this Worker, which DOES set permissive
 * CORS headers on its response.
 *
 * The Authorization header (the Monday API token) is forwarded as-is
 * from the browser. This Worker doesn't store or log the token.
 */

const ALLOWED_ORIGINS = [
  "https://medically-modern.github.io",
  "http://localhost:5173", // for local dev with `npm run dev`
  "http://localhost:8080",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    // Browser preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    const auth = request.headers.get("Authorization");
    if (!auth) {
      return new Response("Missing Authorization header", { status: 401, headers });
    }

    // Forward to Monday's file endpoint, preserving the multipart Content-Type
    // (it carries the boundary; without it Monday can't parse the body and
    // returns 400 with an empty error body).
    const upstreamHeaders = { Authorization: auth };
    const ct = request.headers.get("Content-Type");
    if (ct) upstreamHeaders["Content-Type"] = ct;

    let mondayRes;
    try {
      mondayRes = await fetch("https://api.monday.com/v2/file", {
        method: "POST",
        headers: upstreamHeaders,
        body: request.body,
      });
    } catch (e) {
      return new Response(
        `Upstream error: ${e instanceof Error ? e.message : String(e)}`,
        { status: 502, headers },
      );
    }

    const body = await mondayRes.text();
    return new Response(body, {
      status: mondayRes.status,
      headers: {
        ...headers,
        "Content-Type": mondayRes.headers.get("Content-Type") || "application/json",
      },
    });
  },
};
