# Footer endnote

## Goal

Make the footer a quiet, site-wide endnote. It should provide identity, contact, following, and support paths without duplicating navbar destinations or page-aware sidebar navigation.

## Sidebar cleanup

Remove all optional sidebar intro copy. Sidebar headings and grouped links provide sufficient context, including archive indexes and sphere detail pages.

## Footer content

The footer has two regions.

- Identity: AstroSphere name, the existing one-line archive description, and the current year.
- Utilities: RSS, Contact, Support, then configured external social links.

The footer must not render Trails, Now, About, Colophon, the Bitcoin address, or any archive collection links. Bitcoin and other wallet addresses remain exclusively on the Support page.

## Layout and accessibility

- Keep the existing top border, compact type, and muted visual weight.
- Desktop uses an identity block on the left and a wrapping utility block on the right.
- Phone layouts stack the utility block below the identity block.
- Links retain their existing focus styling and external-link handling.
- The component remains route-independent and accepts no contextual navigation data.

## Validation

- Add source-level tests that reject the removed footer links and wallet address, and require RSS, Contact, Support, and configured socials.
- Run `bun test`, `bunx astro check`, and `bun run build`.
