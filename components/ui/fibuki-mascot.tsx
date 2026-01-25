"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface FibukiMascotProps {
  size?: number;
  className?: string;
  isJumping?: boolean;
  forceFacingRight?: boolean; // Override mouse tracking
}

export function FibukiMascot({ size = 28, className, isJumping = false, forceFacingRight }: FibukiMascotProps) {
  const [mouseFacingRight, setMouseFacingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track mouse position relative to mascot (only when not forced)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (forceFacingRight !== undefined) return; // Skip if externally controlled
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setMouseFacingRight(e.clientX >= rect.left);
  }, [forceFacingRight]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  const facingRight = forceFacingRight !== undefined ? forceFacingRight : mouseFacingRight;

  return (
    <div
      ref={containerRef}
      className={cn("select-none", className)}
      style={{ width: size, height: size }}
    >
      {/* Bounce wrapper */}
      <div
        className={cn("mascot-bounce-target", isJumping && "is-bouncing")}
        style={{ transformOrigin: "center bottom", width: size, height: size }}
      >
        {/* Flip wrapper */}
        <div style={{ transform: facingRight ? "scaleX(-1)" : "scaleX(1)" }}>
          <Image
            src="/FiBuKI_mascot_sml.png"
            alt="FiBuKI mascot"
            width={size}
            height={size}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
