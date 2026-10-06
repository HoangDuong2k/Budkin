// Sơ đồ trang cho máy tìm kiếm: /Budkin/sitemap.xml — hai bản ngôn ngữ, mỗi bản trỏ tới bản kia (hreflang)
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const pages = { vi: new URL(`${base}/`, site).href, en: new URL(`${base}/en/`, site).href }
  const alternates = [
    ...Object.entries(pages).map(([lang, href]) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${pages.vi}"/>`
  ].join('')
  const urls = Object.values(pages)
    .map((href) => `<url><loc>${href}</loc>${alternates}</url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
