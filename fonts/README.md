# Fonts (self-hosted)

- `Geist-Variable.v1.woff2`: Geist (sans), variable weight, unchanged from the `geist` npm package v1.9.2.
- `GeistMono-Variable.plain0.v1.woff2`: Geist Mono from the same package, with one change: the digit `0` uses Geist Mono's own plain zero (stylistic set `ss09`) instead of the slashed one. Done with fontTools by pointing the cmap entry for `0` at the `zero.ss09` glyph.

Both are licensed under the SIL Open Font License 1.1 (`OFL.txt`), which allows modified copies.

The `.v1` in the names is the cache version: nginx caches `/fonts/` for a year, so if a file ever changes, give it a new name (`.v2`) and update `css/theme.css` and both `index.html` preload links.
