"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FibukiMascot } from "@/components/ui/fibuki-mascot";
import { useAuth } from "@/components/auth";
import { cn } from "@/lib/utils";

const LOGO_LETTERS = ["F", "i", "B", "u", "K", "I"];
const LETTER_WIDTHS = [32, 16, 32, 28, 32, 16]; // individual letter widths
const MASCOT_SIZE = 80;
const MOVE_SPEED = 8;
const REGROW_DELAY = 3000;

export function HeroSection() {
  const t = useTranslations("landing.hero");
  const { user, loading } = useAuth();
  const [isLogoJumping, setIsLogoJumping] = useState(false);
  const [isControlMode, setIsControlMode] = useState(false);
  const [mascotX, setMascotX] = useState(0); // position relative to start
  const [facingRight, setFacingRight] = useState(true);
  const [isWalking, setIsWalking] = useState(false);
  const [fallenLetters, setFallenLetters] = useState<Set<number>>(new Set());
  const [growingLetters, setGrowingLetters] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const walkingTimeout = useRef<NodeJS.Timeout | null>(null);

  // Letter positions (relative to text start) with individual widths
  const getLetterPositions = useCallback(() => {
    let offset = 0;
    return LOGO_LETTERS.map((_, i) => {
      const left = offset;
      const right = offset + LETTER_WIDTHS[i];
      offset = right;
      return { left, right };
    });
  }, []);

  // Check collision with letters
  const checkCollisions = useCallback((x: number) => {
    const letterPositions = getLetterPositions();
    // Offset x by MASCOT_SIZE since mascot starts one icon before letters
    const adjustedX = x - MASCOT_SIZE;
    const mascotLeft = adjustedX;
    const mascotRight = adjustedX + MASCOT_SIZE * 0.5; // mascot collision width

    letterPositions.forEach((pos, i) => {
      if (!fallenLetters.has(i) && !growingLetters.has(i)) {
        // Check if mascot overlaps with letter
        if (mascotRight > pos.left && mascotLeft < pos.right) {
          setFallenLetters((prev) => new Set([...prev, i]));
          // Schedule regrow with grow animation
          setTimeout(() => {
            setFallenLetters((prev) => {
              const next = new Set(prev);
              next.delete(i);
              return next;
            });
            setGrowingLetters((prev) => new Set([...prev, i]));
            // Remove from growing after animation completes
            setTimeout(() => {
              setGrowingLetters((prev) => {
                const next = new Set(prev);
                next.delete(i);
                return next;
              });
            }, 400);
          }, REGROW_DELAY);
        }
      }
    });
  }, [fallenLetters, growingLetters, getLetterPositions]);

  // Handle keyboard controls
  useEffect(() => {
    if (!isControlMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        setFacingRight(false);
        setIsWalking(true);
        // Clear previous timeout and set new one
        if (walkingTimeout.current) clearTimeout(walkingTimeout.current);
        walkingTimeout.current = setTimeout(() => setIsWalking(false), 150);
        setMascotX((prev) => {
          const newX = prev - MOVE_SPEED;
          checkCollisions(newX);
          return newX;
        });
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setFacingRight(true);
        setIsWalking(true);
        // Clear previous timeout and set new one
        if (walkingTimeout.current) clearTimeout(walkingTimeout.current);
        walkingTimeout.current = setTimeout(() => setIsWalking(false), 150);
        setMascotX((prev) => {
          const newX = prev + MOVE_SPEED;
          checkCollisions(newX);
          return newX;
        });
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!isLogoJumping) {
          setIsLogoJumping(true);
          // Jump forward in facing direction
          const jumpDistance = MOVE_SPEED * 4;
          const direction = facingRight ? 1 : -1;
          // Animate forward during jump
          let jumpProgress = 0;
          const jumpInterval = setInterval(() => {
            jumpProgress++;
            setMascotX((prev) => {
              const newX = prev + (direction * jumpDistance) / 10;
              checkCollisions(newX);
              return newX;
            });
            if (jumpProgress >= 10) {
              clearInterval(jumpInterval);
            }
          }, 50);
          setTimeout(() => setIsLogoJumping(false), 600);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isControlMode, isLogoJumping, checkCollisions]);

  // Handle click to enter control mode
  const handleLogoClick = () => {
    if (!isControlMode) {
      setIsControlMode(true);
      setMascotX(0);
      setFallenLetters(new Set());
      // Initial jump
      setIsLogoJumping(true);
      setTimeout(() => setIsLogoJumping(false), 600);
    }
  };

  // Handle blur to exit control mode
  const handleBlur = () => {
    setIsControlMode(false);
    setMascotX(0);
    setFallenLetters(new Set());
    setGrowingLetters(new Set());
  };

  return (
    <div className="text-center space-y-6 max-w-2xl">
      {/* Logo */}
      <div
        ref={controlRef}
        tabIndex={0}
        onClick={handleLogoClick}
        onBlur={handleBlur}
        className={cn(
          "inline-flex items-center gap-4 logo-wrapper mx-auto cursor-pointer outline-none relative",
          isControlMode && "ring-2 ring-primary/20 rounded-lg p-2"
        )}
      >
        {/* Mascot - positioned absolutely in control mode */}
        {/* Outer div handles position, inner div handles wiggle/flip */}
        <div
          className={cn(
            isControlMode ? "absolute z-10" : "relative"
          )}
          style={
            isControlMode
              ? {
                  transform: `translate3d(${mascotX}px, 0, 0)`,
                  left: -MASCOT_SIZE - 16,
                  top: "50%",
                  marginTop: -MASCOT_SIZE / 2,
                  willChange: "transform",
                }
              : undefined
          }
        >
          <div
            className={cn(isWalking && !isLogoJumping && "animate-wiggle")}
            style={{ transform: `scaleX(${facingRight ? 1 : -1})` }}
          >
            <FibukiMascot size={MASCOT_SIZE} isJumping={isLogoJumping} />
          </div>
        </div>

        {/* Logo text with individual letters */}
        <div className="flex items-baseline" style={{ fontSize: "3.75rem" }}>
          {LOGO_LETTERS.map((letter, i) => (
            <span
              key={i}
              className={cn(
                "mascot-text inline-block",
                fallenLetters.has(i) && "animate-letter-fall",
                growingLetters.has(i) && "animate-letter-grow"
              )}
            >
              {letter}
            </span>
          ))}
        </div>
      </div>

      {/* Control hint */}
      {isControlMode && (
        <p className="text-xs text-muted-foreground animate-pulse">
          ← → to move, Space to jump
        </p>
      )}

      {/* Tagline */}
      <h1 className="text-3xl font-semibold text-foreground">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("subtitle")}</p>

      {/* CTA Button */}
      {!loading && (
        <Button asChild size="lg" className="mt-4">
          <Link href={user ? "/transactions" : "/login"}>
            {user ? t("ctaLogin") : t("ctaGetStarted")}
          </Link>
        </Button>
      )}
    </div>
  );
}
