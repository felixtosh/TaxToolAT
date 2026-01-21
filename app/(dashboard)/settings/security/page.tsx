"use client";

import { MfaStatusCard } from "@/components/mfa";

export default function SecurityPage() {
  return (
    <>
      <div className="mb-8">
        <h2 className="text-xl font-semibold">Security</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Two-factor authentication and account protection
        </p>
      </div>

      <MfaStatusCard />
    </>
  );
}
