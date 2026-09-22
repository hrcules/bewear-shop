import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const store = url.searchParams.get("store");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://lvh.me:3000";

  const baseUrl = new URL(appUrl);

  if (
    store &&
    store !== "www" &&
    store !== "localhost" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(store)
  ) {
    baseUrl.hostname = `${store}.${baseUrl.hostname}`;
  }

  baseUrl.pathname = "/";
  baseUrl.search = "";
  baseUrl.hash = "";

  return NextResponse.redirect(baseUrl);
}
