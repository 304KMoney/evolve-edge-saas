# Website Cybersecurity Guards

This repo applies layered website security controls across public pages, dashboard surfaces, and API routes.

## Browser And Response Guards

- Centralized CSP generation for middleware and Next.js response headers.
- Security headers applied across site surfaces:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
  - `Origin-Agent-Cluster`
  - `X-DNS-Prefetch-Control`
- Private surfaces such as `/dashboard`, `/admin`, auth routes, onboarding, and `/api/*` are marked `no-store` and `noindex`.
- Preview public pages are marked `noindex` to reduce accidental exposure.

## Route-Level Guards

- State-changing browser-facing API routes enforce trusted same-origin requests before processing:
  - `/api/auth/logout-everywhere`
  - `/api/analytics/track`
  - `/api/billing/checkout`
  - `/api/billing/portal`
  - `/api/upsell/track`
- Existing rate limiting, webhook signature validation, and internal bearer-token authorization remain in place.

## Operator Notes

- Trusted-origin enforcement allows the request origin itself and the configured app base URL.
- Machine-to-machine internal routes and webhooks should continue using bearer/service secrets and signature verification rather than browser-origin checks.
- If additional first-party origins are introduced later, extend the trusted-origin allowlist deliberately rather than weakening origin checks globally.
