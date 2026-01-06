"use client";

import { useState, useRef, useEffect } from "react";
import { ExtractedFieldLocation } from "@/types/file";
import { cn } from "@/lib/utils";

// Field colors for overlay boxes
const FIELD_COLORS: Record<ExtractedFieldLocation["field"], { bg: string; border: string; text: string }> = {
  date: { bg: "bg-blue-500/20", border: "border-blue-500", text: "text-blue-700" },
  amount: { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-700" },
  currency: { bg: "bg-green-500/20", border: "border-green-500", text: "text-green-700" },
  vatPercent: { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-700" },
  partner: { bg: "bg-purple-500/20", border: "border-purple-500", text: "text-purple-700" },
  vatId: { bg: "bg-cyan-500/20", border: "border-cyan-500", text: "text-cyan-700" },
  iban: { bg: "bg-pink-500/20", border: "border-pink-500", text: "text-pink-700" },
  address: { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-700" },
};

const FIELD_LABELS: Record<ExtractedFieldLocation["field"], string> = {
  date: "Date",
  amount: "Amount",
  currency: "Currency",
  vatPercent: "VAT",
  partner: "Partner",
  vatId: "VAT ID",
  iban: "IBAN",
  address: "Address",
};

interface FileOverlayViewerProps {
  imageUrl: string;
  extractedFields?: ExtractedFieldLocation[];
  showOverlays?: boolean;
  onFieldClick?: (field: ExtractedFieldLocation) => void;
  className?: string;
}

export function FileOverlayViewer({
  imageUrl,
  extractedFields = [],
  showOverlays = true,
  onFieldClick,
  className,
}: FileOverlayViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  // Track image load to get dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // Filter fields that have bounding boxes
  const fieldsWithBoxes = extractedFields.filter((f) => f.boundingBox?.vertices?.length === 4);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Document"
        className="w-full h-auto"
        onLoad={handleImageLoad}
      />

      {/* Overlay boxes */}
      {showOverlays && imageSize && fieldsWithBoxes.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="none"
        >
          {fieldsWithBoxes.map((field, index) => {
            const vertices = field.boundingBox!.vertices;
            const colors = FIELD_COLORS[field.field];
            const isHovered = hoveredField === `${field.field}-${index}`;

            // Convert normalized coordinates (0-1) to image coordinates
            const points = vertices
              .map((v) => `${v.x * imageSize.width},${v.y * imageSize.height}`)
              .join(" ");

            // Map border class to hex color
            const colorMap: Record<string, string> = {
              "border-blue-500": "#3b82f6",
              "border-green-500": "#22c55e",
              "border-orange-500": "#f97316",
              "border-purple-500": "#a855f7",
              "border-cyan-500": "#06b6d4",
              "border-pink-500": "#ec4899",
              "border-yellow-500": "#eab308",
            };
            const strokeColor = colorMap[colors.border] || "#a855f7";

            return (
              <g key={`${field.field}-${index}`}>
                <polygon
                  points={points}
                  className={cn(
                    "transition-all duration-200",
                    isHovered ? "fill-current opacity-40" : "fill-current opacity-20"
                  )}
                  style={{ fill: strokeColor }}
                />
                <polygon
                  points={points}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 3 : 2}
                  className="pointer-events-auto cursor-pointer"
                  onMouseEnter={() => setHoveredField(`${field.field}-${index}`)}
                  onMouseLeave={() => setHoveredField(null)}
                  onClick={() => onFieldClick?.(field)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {/* Hover tooltip */}
      {hoveredField && (
        <div className="absolute top-2 left-2 bg-background/95 border rounded-md shadow-lg px-3 py-2 text-sm">
          {fieldsWithBoxes.map((field, index) =>
            hoveredField === `${field.field}-${index}` ? (
              <div key={`tooltip-${index}`}>
                <span className={cn("font-medium", FIELD_COLORS[field.field].text)}>
                  {FIELD_LABELS[field.field]}:
                </span>{" "}
                {field.value}
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Legend component showing field colors
 */
export function OverlayLegend({ fields }: { fields?: ExtractedFieldLocation[] }) {
  const uniqueFields = new Set(fields?.map((f) => f.field) || []);

  if (uniqueFields.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {Array.from(uniqueFields).map((field) => (
        <div key={field} className="flex items-center gap-1.5">
          <div
            className={cn(
              "w-3 h-3 rounded-sm border-2",
              FIELD_COLORS[field].bg,
              FIELD_COLORS[field].border
            )}
          />
          <span className="text-muted-foreground">{FIELD_LABELS[field]}</span>
        </div>
      ))}
    </div>
  );
}
