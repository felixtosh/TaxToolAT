export const dynamic = "force-dynamic";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  const extractorPath = path.join(
    process.cwd(),
    "extensions",
    "taxstudio-browser",
    "dev-extractor.js"
  );
  let script = "";
  try {
    script = fs.readFileSync(extractorPath, "utf-8");
  } catch (err) {
    script = "ctx.log('No dev extractor script found.');";
  }
  return new Response(script, {
    headers: {
      ...corsHeaders,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
