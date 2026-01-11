"use client";

import { useState } from "react";
import { ExtractedFieldLocation } from "@/types/file";
import { cn } from "@/lib/utils";

// Field colors for overlay boxes (same as file-overlay-viewer)
const FIELD_COLORS: Record<ExtractedFieldLocation["field"], { stroke: string; fill: string }> = {
  date: { stroke: "#3b82f6", fill: "#3b82f6" },
  amount: { stroke: "#22c55e", fill: "#22c55e" },
  currency: { stroke: "#22c55e", fill: "#22c55e" },
  vatPercent: { stroke: "#f97316", fill: "#f97316" },
  partner: { stroke: "#a855f7", fill: "#a855f7" },
  vatId: { stroke: "#06b6d4", fill: "#06b6d4" },
  iban: { stroke: "#ec4899", fill: "#ec4899" },
  address: { stroke: "#eab308", fill: "#eab308" },
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

interface BoundingBoxOverlayProps {
  fields: ExtractedFieldLocation[];
  width: number;
  height: number;
  onFieldClick?: (field: ExtractedFieldLocation) => void;
  className?: string;
}

export function BoundingBoxOverlay({
  fields,
  width,
  height,
  onFieldClick,
  className,
}: BoundingBoxOverlayProps) {
  const [hoveredField, setHoveredField] = useState<string | null>(null);

  // Filter fields that have bounding boxes with 4 vertices
  const fieldsWithBoxes = fields.filter((f) => f.boundingBox?.vertices?.length === 4);

  if (fieldsWithBoxes.length === 0 || width === 0 || height === 0) {
    return null;
  }

  return (
    <div
      className={cn("absolute inset-0 pointer-events-none flex items-center justify-center", className)}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {fieldsWithBoxes.map((field, index) => {
          const vertices = field.boundingBox!.vertices;
          const colors = FIELD_COLORS[field.field];
          const isHovered = hoveredField === `${field.field}-${index}`;

          // Convert normalized coordinates (0-1) to actual coordinates
          const points = vertices
            .map((v) => `${v.x * width},${v.y * height}`)
            .join(" ");

          return (
            <g key={`${field.field}-${index}`}>
              {/* Fill */}
              <polygon
                points={points}
                fill={colors.fill}
                fillOpacity={isHovered ? 0.35 : 0.15}
                className="transition-all duration-200"
              />
              {/* Stroke */}
              <polygon
                points={points}
                fill="none"
                stroke={colors.stroke}
                strokeWidth={isHovered ? 3 : 2}
                className="pointer-events-auto cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredField(`${field.field}-${index}`)}
                onMouseLeave={() => setHoveredField(null)}
                onClick={() => onFieldClick?.(field)}
              />
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredField && (
        <div className="absolute top-2 left-2 bg-background/95 border rounded-md shadow-lg px-3 py-2 text-sm pointer-events-none z-10">
          {fieldsWithBoxes.map((field, index) =>
            hoveredField === `${field.field}-${index}` ? (
              <div key={`tooltip-${index}`}>
                <span
                  className="font-medium"
                  style={{ color: FIELD_COLORS[field.field].stroke }}
                >
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
