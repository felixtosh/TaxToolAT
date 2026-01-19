"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Position {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface HighlightPinProps {
  /** CSS selector for target element */
  target: string;
  /** Whether this pin is active (should show) */
  active: boolean;
  /** Label to show next to the highlight */
  label?: string;
  /** Position of the label relative to target */
  labelPosition?: "top" | "bottom" | "left" | "right";
  /** Whether to scroll target into view */
  scrollIntoView?: boolean;
}

export function HighlightPin({
  target,
  active,
  label,
  labelPosition = "right",
  scrollIntoView = true,
}: HighlightPinProps) {
  const [targetPosition, setTargetPosition] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<Element | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const updatePosition = useCallback(() => {
    if (!elementRef.current) return;

    const rect = elementRef.current.getBoundingClientRect();
    setTargetPosition({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    if (!active || !mounted) {
      setTargetPosition(null);
      return;
    }

    // Find the target element
    const element = document.querySelector(target);
    if (!element) {
      setTargetPosition(null);
      return;
    }

    elementRef.current = element;

    // Scroll into view if needed
    if (scrollIntoView) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Initial position update
    updatePosition();

    // Track position changes with ResizeObserver
    observerRef.current = new ResizeObserver(updatePosition);
    observerRef.current.observe(element);

    // Also track scroll and resize
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      elementRef.current = null;
    };
  }, [target, active, mounted, scrollIntoView, updatePosition]);

  if (!mounted || !targetPosition || !active) return null;

  // Calculate label position
  const labelStyle: React.CSSProperties = {};
  const padding = 12;

  switch (labelPosition) {
    case "top":
      labelStyle.bottom = targetPosition.height + padding;
      labelStyle.left = "50%";
      labelStyle.transform = "translateX(-50%)";
      break;
    case "bottom":
      labelStyle.top = targetPosition.height + padding;
      labelStyle.left = "50%";
      labelStyle.transform = "translateX(-50%)";
      break;
    case "left":
      labelStyle.right = targetPosition.width + padding;
      labelStyle.top = "50%";
      labelStyle.transform = "translateY(-50%)";
      break;
    case "right":
    default:
      labelStyle.left = targetPosition.width + padding;
      labelStyle.top = "50%";
      labelStyle.transform = "translateY(-50%)";
      break;
  }

  return createPortal(
    <div
      className="fixed pointer-events-none"
      style={{
        top: targetPosition.top,
        left: targetPosition.left,
        width: targetPosition.width,
        height: targetPosition.height,
        zIndex: 100,
      }}
    >
      {/* Pulsing ring around target */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg",
          "border-2 border-primary",
          "animate-pulse"
        )}
        style={{
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          width: targetPosition.width + 8,
          height: targetPosition.height + 8,
        }}
      />

      {/* Outer glow ring */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg",
          "border border-primary/30",
          "animate-ping"
        )}
        style={{
          top: -8,
          left: -8,
          right: -8,
          bottom: -8,
          width: targetPosition.width + 16,
          height: targetPosition.height + 16,
          animationDuration: "1.5s",
        }}
      />

      {/* Label badge */}
      {label && (
        <div
          className={cn(
            "absolute whitespace-nowrap",
            "flex items-center gap-2",
            "bg-primary text-primary-foreground",
            "px-3 py-1.5 rounded-full shadow-lg",
            "text-sm font-medium",
            "animate-in fade-in slide-in-from-left-2 duration-300"
          )}
          style={labelStyle}
        >
          {/* Pulsing dot */}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
          </span>
          {label}
        </div>
      )}
    </div>,
    document.body
  );
}
