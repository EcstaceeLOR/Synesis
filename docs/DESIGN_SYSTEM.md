# Synesis application design system

The Synesis operations interface uses a high-contrast carbon canvas, warm white
type, and an acid-green signal color reserved for verified, ready, or primary
states. Amber communicates an action still required, red communicates a safe
rejection or failure, and blue communicates informational or in-flight states.
Color is always paired with text and shape.

Reusable primitives live in `@synesis/ui`:

- `EnvironmentBadge` makes `LIVE / BASE MAINNET` versus `DEMO / NO VALUE`
  persistent and explicit.
- `MetricCard`, `StatusBadge`, and `DataTable` provide shared data-display
  semantics.
- `StatePanel` and the `ViewState<T>` contract cover loading, empty, partial,
  error, rejected, failed, and unconfirmed results.
- `LoadingSkeleton` provides the shared streamed-navigation fallback.

Every product page calls `loadProductPage` and renders a `ViewState<T>`. Demo
mode receives typed local fixtures. Live mode calls the server-side UI API with
the opaque session cookie, disables caching, validates the response boundary,
and renders an explicit empty, partial, or error state when needed. Route
components contain no embedded rows or metrics.

The application shell supplies semantic navigation, main and complementary
landmarks; a keyboard skip link; `aria-current` route indication; a searchable
Command/Ctrl+K destination palette; Escape handling; a native mobile disclosure;
keyboard-scrollable labelled tables; visible three-pixel focus outlines; and a
reduced-motion mode. The repository-wide JSX accessibility rules run in CI.
