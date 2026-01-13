import type { APIContext } from "astro";
import { href } from "../lib/href";

export function GET(context: APIContext): Response {
  const site = context.site ?? new URL(context.url.origin);
  const repo = "https://github.com/TUR1412/ACG";
  const demo = new URL(href("/"), site).toString();

  const body = [
    "/* TEAM */",
    "Maintainer: TUR1412",
    `Site: ${demo}`,
    `Repo: ${repo}`,
    "",
    "/* ABOUT */",
    "ACG Radar / ACGレーダー",
    "每小时更新的 ACG 资讯雷达（静态站点 + GitHub Actions 同步）。",
    "毎時更新の ACG ニュースレーダー（静的サイト + GitHub Actions 同期）。",
    "",
    "/* TECHNOLOGY */",
    "Astro, TypeScript, Tailwind CSS",
    "",
    "/* SOURCE */",
    `Repository: ${repo}`,
    "License: MIT",
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400"
    }
  });
}
