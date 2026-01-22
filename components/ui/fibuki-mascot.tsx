"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface FibukiMascotProps {
  size?: number;
  className?: string;
  isJumping?: boolean;
}

export function FibukiMascot({ size = 28, className, isJumping = false }: FibukiMascotProps) {
  const [facingRight, setFacingRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track mouse position relative to mascot
  // Face right when cursor is on mascot or to the right of it
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    // Face left only when cursor is to the left of the mascot's left edge
    setFacingRight(e.clientX >= rect.left);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

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
