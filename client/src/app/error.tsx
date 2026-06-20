"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Next.js 16 App Router global error boundary.
 *
 * NOTE: In Next.js 16.2+ the `reset` prop was deprecated in favor of
 * `unstable_retry` (see `node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md`). We use `unstable_retry` as the source of
 * truth here. The deprecated class `components/ErrorBoundary.tsx` stays as
 * defense-in-depth in `app/layout.tsx` (it cannot catch Server Component
 * errors, only client render + event handler errors).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("GlobalError caught:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="min-h-[50vh] flex flex-col items-center justify-center text-text-muted p-8"
    >
      <AlertCircle className="w-12 h-12 text-status-error mb-4" />
      <h2 className="text-xl font-bold text-text-primary mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-text-secondary mb-2 max-w-md text-center">
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest ? (
        <p className="text-xs text-text-muted mb-6 font-mono">
          digest: {error.digest}
        </p>
      ) : (
        <div className="mb-6" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-medium transition-colors shadow-glow"
      >
        <RefreshCw className="w-4 h-4" />
        Try Again
      </button>
    </div>
  );
}
