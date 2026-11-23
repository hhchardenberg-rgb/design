import { cn } from "@/lib/utils";

export { designPreviewSrc, templateThumbnailSrc } from "@/lib/design/preview";

/**
 * Voorbeeld van een ontwerp of template in een overzicht. Toont altijd het
 * hele ontwerp (passend in het vlak, niet bijgesneden), zodat liggende
 * (bv. 16:9) en hoge (9:16) formaten even goed herkenbaar zijn.
 */
export function DesignThumbnail({
  src,
  alt = "",
  className,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex aspect-[4/5] items-center justify-center overflow-hidden bg-surface-muted", className)}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain shadow-sm" />
      )}
    </div>
  );
}

