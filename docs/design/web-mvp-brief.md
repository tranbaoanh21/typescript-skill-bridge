# Web MVP design brief

## Direction

The SkillBridge web client uses an **HCMUT workshop board** direction: editorial, technical, and intentionally asymmetric. It applies the review habits from Taste Skill while keeping the implementation native to React and CSS.

Design dials:

| Dial     | Value | Product consequence                                               |
| -------- | ----: | ----------------------------------------------------------------- |
| Variance |  6/10 | Strong hierarchy, asymmetric hero and indexed project rows        |
| Motion   |  3/10 | Interaction feedback only; reduced-motion is respected            |
| Density  |  6/10 | Operational pages expose useful context without dashboard clutter |

## Tokens and rules

- Paper `#f3f0e7`, ink `#101713`, signal blue `#294cff`, acid `#c8f35d`.
- No gradients, glass effects, decorative stock imagery, or repeated floating-card treatment.
- Monospace microcopy marks status, coordinates, indexes, and system metadata.
- Large editorial headings communicate the current job; operational controls remain compact.
- Focus indicators use signal blue and remain visible on every interactive element.

## Journeys covered

| Actor   | Journey                                                                                      |
| ------- | -------------------------------------------------------------------------------------------- |
| Guest   | Discover/filter projects → inspect brief → register or log in                                |
| Student | Maintain profile/skills → apply → track/withdraw application → open accepted workspace       |
| Owner   | Create/publish project → edit brief/lifecycle → accept/reject candidates → manage task board |

TanStack Query owns server state and invalidation. Authentication is kept in session storage and refreshed through the API. Optimistic updates are limited to reversible task and application mutations and restore the previous cache value on failure.

## Responsive contract

- Desktop: three-zone hero, split detail/editor layouts, four-column delivery board.
- Tablet (up to `1000px`): collapsible navigation and stacked content panels.
- Mobile (up to `700px`): single-column forms, horizontal task board, full-width actions, compact header.
- Minimum supported viewport width is `320px`.

## State and accessibility audit

- Discovery, project, profile, applications, owner management, and workspace routes expose loading and error states.
- Empty states explain the next useful action.
- Form controls have programmatic labels and server errors use alert semantics where appropriate.
- Navigation, lifecycle controls, application decisions, and task transitions are keyboard-operable.
- `prefers-reduced-motion` disables non-essential animation and smooth scrolling.

## Verification evidence

- Strict TypeScript, ESLint, component tests, and production build run in the repository quality gate.
- Browser QA covered desktop and mobile discovery, public project detail, login/session, profile, project creation, and responsive navigation against the real local API and PostgreSQL seed.
- Owner management is covered by a component interaction test plus API integration and Newman contract tests; durable browser automation is added in the quality-engineering phase.
