"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { route: "app.global-error" },
        extra: { digest: error.digest ?? null }
      });
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#f8fafc",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px"
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#ffffff",
            borderRadius: 24,
            border: "1px solid #e2eaf3",
            padding: "40px 36px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)"
          }}
        >
          {/* Logo / wordmark */}
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#1cc7d8"
            }}
          >
            Evolve Edge
          </p>

          <h1
            style={{
              margin: "16px 0 0",
              fontSize: 24,
              fontWeight: 600,
              color: "#05111d",
              lineHeight: 1.25
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              lineHeight: 1.7,
              color: "#5a7184"
            }}
          >
            An unexpected error occurred. This has been logged and we&apos;ll
            look into it. Try refreshing the page — if the problem persists,
            contact us at{" "}
            <a
              href="mailto:k.green@evolveedgeai.com"
              style={{ color: "#1cc7d8", textDecoration: "none" }}
            >
              k.green@evolveedgeai.com
            </a>
            .
          </p>

          {error.digest && (
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 12,
                color: "#8fa3b4",
                fontFamily: "monospace"
              }}
            >
              Error ref: {error.digest}
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                background: "linear-gradient(135deg, #1cc7d8, #6fe8f1)",
                color: "#05111d",
                fontWeight: 600,
                fontSize: 14,
                padding: "10px 22px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 8px 24px rgba(28,199,216,0.22)"
              }}
            >
              Try again
            </button>

            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                border: "1px solid #e2eaf3",
                background: "#ffffff",
                color: "#05111d",
                fontWeight: 600,
                fontSize: 14,
                padding: "10px 22px",
                textDecoration: "none"
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
