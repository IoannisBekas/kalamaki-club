# Kalamaki Club

Website for **Kalamaki Club**, a charcoal-grill souvlaki shop in Piraeus: kalamakia, gyros pitas, plates, hand-cut fries and dips.

It's a static single page with no build step. Plain HTML/CSS/JS, plus Tailwind, GSAP, Lenis and Lucide from CDNs. Every food illustration is an inline SVG drawn in code (`assets/js/art.js`), so there are no photos to manage.

## Features
- A charcoal-grill hero with rising embers, a glowing grill disc with the pita mascot, and delivery tickers
- A scroll-driven "Anatomy of a pita" scene where the classic pork pita comes apart into its eight layers
- A filterable, searchable menu of 35 dishes on a taverna-tablecloth background
- A customizer ("Grill control") with a heat dial, a meat-spit selector, sauces, extras, notes and a live price
- A cart ("the tray") with delivery/take-away, a free-delivery tracker, and a WhatsApp order written in Greek (or call / copy)
- A map card, opening hours with a live open/closed status, and Instagram and e-food links
- Mobile bottom dock, reduced-motion support, and an optional grill-sizzle ambience

## Editing the menu & shop details
Everything editable lives in **`assets/js/menu-data.js`**:
- `KC_CONFIG`: name, phone, WhatsApp number, address, min order, delivery fee, free-delivery threshold, hours, Instagram, e-food link
- `KC_OPTIONS`: customization groups, surcharges, and how each choice reads in the order message
- `KC_MENU`: dishes (name, price, description, tags, illustration recipe, options)

Lines marked `// VERIFY` are placeholders. The phone and WhatsApp number (`210 000 0000`), address, prices, hours, delivery fee, Instagram handle and e-food URL must all be replaced with the real shop's details before promoting the site. The phone number also appears in the ticker text and the JSON-LD block in `index.html`.

## Run locally
```bash
python -m http.server 5392
```
Then open http://localhost:5392.
