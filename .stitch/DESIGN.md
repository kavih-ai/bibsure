# Design System: The Resting Samurai - Home
**Project ID:** 13492313671653233726

## 1. Visual Theme & Atmosphere
**The Editorial Curator**
This design system is built upon the philosophy of the "Editorial Curator". It rejects the cluttered, "boxed-in" nature of traditional web templates in favor of a high-end gallery experience. The aesthetic is defined by an extreme commitment to whitespace as a functional element, not just a gap between content. By utilizing intentional asymmetry, we create a rhythmic, musical flow, treating every page as a custom-printed monograph. The goal is to make the digital interface disappear, leaving only the artwork and the message.

## 2. Color Palette & Roles
The palette is a sophisticated study in neutrals, punctuated by a singular, authoritative accent.

- **Surface Base (#f9f9f9):** Used for the base background, creating a sense of infinite space.
- **Surface Lowest (#ffffff):** Used for cards and interactive elements stacked atop the base to create depth.
- **Surface Low (#f2f4f4):** Used for sectioning content areas through tonal shifts rather than lines.
- **Charcoal Text (#2d3435):** Used for standard text, providing legibility and an "ink-on-paper" feel.
- **Ghost Outline (#adb3b4):** Used at 10% opacity for input fields to provide a "whisper" of a boundary.
- **Crimson Thread (#b3282c):** The primary accent. Used sparingly to draw the eye to a singular call to action or brand moment. Applied with a subtle linear gradient to `#a21a22` for a weighted, premium feel.

## 3. Typography Rules
The typographic style juxtaposes mechanical precision with literary elegance.
- **Headers & Display (Newsreader):** Used for all major entry points. Set with slightly tighter letter-spacing (-0.02em) to evoke high-end editorial printing.
- **Body & Labels (Manrope):** All functional text uses Manrope. It provides a neutral, modern counterpoint to the serif headers.
- **The Lead-In Pattern:** Start the first sentence of long-form articles with a thicker Manrope weight to anchor the reader before transitioning into Newsreader body.

## 4. Component Stylings
- **Buttons:** 
  - *Primary:* High-contrast Crimson (#b3282c) background with off-white text. Hard 0px corners, no borders. 
  - *Secondary:* Pale gray background (#dde4e5) with charcoal text. 
  - *Tertiary:* Text-only Crimson with an underlined hover state at 20% opacity.
- **Cards/Containers:** Hard edges (0px border radius, no rounded corners). Built using background color shifts (e.g., `#ffffff` on `#f2f4f4`) to define the container. No 1px lines or borders between list items.
- **Inputs/Forms:** Minimalist bottom-border only using ghost outline (#adb3b4 at 30%). Unfocused boundaries are subtle; focus transitions to Crimson and shifts label up.
- **Image Frames:** "Exhibition" style frames using `surface_container_low` as a wide margin around the asset, mimicking a matted gallery frame.

## 5. Layout Principles
- **Asymmetric Positioning:** Offset text columns. Let an image take up 60% of the width while text takes up 30%, leaving 10% as dead space.
- **Whitespace & Breathing Room:** Extreme commitment to whitespace. Use 2rem (spacing-6) to separate list items and 8.5rem (spacing-24) between major sections.
- **Tonal Layering for Depth:** No heavy drop shadows. Rely on stacking surface tiers (Base -> Low -> Lowest). If ambient shadow is required, use a 40px blur, 0px spread, 4% opacity charcoal.
- **Zero Default Grids:** Do not align everything to a rigid 12-column center. Create staggered, organic content layouts.
