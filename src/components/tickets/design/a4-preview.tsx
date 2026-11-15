"use client";
/* eslint-disable @next/next/no-img-element */

import "./ticket-fonts.css";
import { useMemo } from "react";
import { preload } from "react-dom";
import type { A4Box, A4Layout, FontKey } from "@/lib/tickets/design/a4-layout";
import { qrMatrix, qrPath } from "@/lib/tickets/design/qr-matrix";
import { TICKET_FONTS } from "@/lib/tickets/design/fonts";

// Tekent de door de server berekende A4-indeling als svg: dezelfde posities, regels en
// lettertypen als in de pdf. Alleen voor het voorbeeld in de editor.

const FONT: Record<FontKey, { family: string; weight: number }> = TICKET_FONTS;

function Qr({ b }: { b: Extract<A4Box, { t: "qr" }> }) {
  const m = useMemo(() => qrMatrix(b.code), [b.code]);
  return (
    <svg x={b.x} y={b.y} width={b.size} height={b.size} viewBox={`0 0 ${m.size} ${m.size}`} shapeRendering="crispEdges">
      <path d={qrPath(m)} fill="#000" />
    </svg>
  );
}

export function A4Preview({ layout, grayscale, className }: { layout: A4Layout; grayscale?: boolean; className?: string }) {
  // De posities zijn met de echte lettertypen berekend; laad ze meteen, anders loopt tekst even uit het vak.
  for (const k of new Set(layout.boxes.flatMap((b) => (b.t === "text" ? [b.font] : [])))) {
    const href = TICKET_FONTS[k].web;
    preload(href, { as: "font", type: href.endsWith(".woff2") ? "font/woff2" : "font/otf", crossOrigin: "anonymous" });
  }
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={className} role="img" aria-label="Voorbeeld van het A4-ticket" style={{ background: "#fff", width: "100%", height: "auto", filter: grayscale ? "grayscale(1)" : undefined, boxShadow: "0 1px 4px rgba(0,0,0,.15)" }}>
      {layout.boxes.map((b, i) => {
        switch (b.t) {
          case "rect":
            return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.radius} fill={b.fill ?? "none"} stroke={b.stroke} strokeWidth={b.stroke ? b.strokeWidth ?? 1 : 0} opacity={b.opacity} />;
          case "text": {
            const f = FONT[b.font];
            return (
              <text key={i} x={b.x} y={b.y} fontSize={b.size} fontFamily={f.family} fontWeight={f.weight} fill={b.color} opacity={b.opacity} transform={b.rotate ? `rotate(${-b.rotate} ${b.x} ${b.y})` : undefined} style={{ whiteSpace: "pre", fontKerning: "normal", fontVariantLigatures: "none" }}>
                {b.text}
              </text>
            );
          }
          case "line":
            return <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={b.color} strokeWidth={b.width} strokeDasharray={b.dash?.join(" ")} />;
          case "image": {
            if (b.crop) {
              // Uitsnede: het hele beeld schalen en verschuiven, met een kader eromheen.
              const sx = b.w / b.crop.sw;
              const id = `clip-${i}`;
              return (
                <g key={i}>
                  <clipPath id={id}>
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} />
                  </clipPath>
                  <image href={b.asset.url} x={b.x - b.crop.sx * sx} y={b.y - b.crop.sy * sx} width={b.asset.width * sx} height={b.asset.height * sx} clipPath={`url(#${id})`} opacity={b.opacity} preserveAspectRatio="none" />
                </g>
              );
            }
            return <image key={i} href={b.asset.url} x={b.x} y={b.y} width={b.w} height={b.h} opacity={b.opacity} preserveAspectRatio="xMidYMid meet" />;
          }
          case "qr":
            return <Qr key={i} b={b} />;
        }
      })}
    </svg>
  );
}
