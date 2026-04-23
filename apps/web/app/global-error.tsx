"use client";

import { useEffect } from "react";
import { captureClientException } from "../lib/sentry-runtime";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void captureClientException(error, {
        tags: {
          route: "app.global-error"
        },
        extra: {
          digest: error.digest ?? null
        }
      });
    }
  }, [error]);

  return (
    <html>
      <body>
        <h2>Something went wrong.</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
