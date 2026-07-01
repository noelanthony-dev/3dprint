---
name: Industrial Precision Light
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#3c4a3c'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#6c7b6a'
  outline-variant: '#bbcbb8'
  surface-tint: '#006e2a'
  primary: '#006e2a'
  on-primary: '#ffffff'
  primary-container: '#00c853'
  on-primary-container: '#004c1b'
  inverse-primary: '#3ce36a'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#585f6c'
  on-tertiary: '#ffffff'
  tertiary-container: '#a7aebd'
  on-tertiary-container: '#3b424e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#69ff87'
  primary-fixed-dim: '#3ce36a'
  on-primary-fixed: '#002108'
  on-primary-fixed-variant: '#00531e'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#dce2f3'
  tertiary-fixed-dim: '#c0c7d6'
  on-tertiary-fixed: '#151c27'
  on-tertiary-fixed-variant: '#404754'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-label:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 16px
  margin: 24px
---

## Brand & Style

This design system embodies a high-performance, technical aesthetic tailored for engineering, data visualization, and developer-centric interfaces. The brand personality is clinical, efficient, and uncompromisingly precise. 

The style is a fusion of **Modern Corporate** and **Technical Minimalism**. It prioritizes clarity and information density over decorative elements. By utilizing a high-contrast light theme, the UI evokes a sense of "digital laboratory" equipment—clean, professional, and reliable. The emotional response should be one of focused productivity, where the tool disappears to let the data take center stage.

## Colors

The color palette is built on a foundation of "Technical Grays" to ensure maximum legibility and a sober environment.

- **Primary (#00C853):** A high-visibility neon green used strictly for action states, success indicators, and progress. Against the light background, it serves as a "laser-pointer" focus element.
- **Surface Palette:** We utilize a three-tier system: `Background` (#F9FAFB) for the lowest layer, `Surface-Container` (#F3F4F6) for grouping content, and `Surface` (#FFFFFF) for elevated interactive cards or modals.
- **Typography:** Deep charcoal (#111827) provides a high-contrast ratio against white surfaces, essential for long-form data reading.
- **Borders:** A subtle gray (#E5E7EB) defines the structure without creating visual noise.

## Typography

This design system exclusively uses **Geist**, a typeface designed for precision and technical applications. 

- **Headlines:** Use Semi-Bold weights with tight letter spacing to create a compact, authoritative look.
- **Labels:** Small labels use a medium weight and a subtle tracking increase to maintain readability at small scales, particularly for data headers.
- **Monospaced characteristics:** While Geist is a sans-serif, its rhythmic spacing allows for high legibility in tabular data and code snippets.
- **Mobile scaling:** Headlines above 24px should scale down by 15% on mobile devices to prevent excessive wrapping.

## Layout & Spacing

The layout is governed by a strict **8px grid system**, ensuring every element is mathematically aligned. 

- **Grid:** A 12-column fluid grid is preferred for desktop, shifting to a 4-column layout for mobile.
- **Density:** The design system favors a "compact" density model. Content containers should use `md` (16px) padding to maximize the amount of information visible on screen.
- **Hierarchy:** Use white space (`xl` spacing) to separate major functional modules, while using `sm` or `xs` spacing for elements within a group (e.g., a label and its input).

## Elevation & Depth

To maintain the "Industrial" aesthetic, we avoid soft, ambient shadows. Instead, depth is conveyed through **Tonal Layering** and **Low-Contrast Outlines**.

- **Level 0:** Background (#F9FAFB).
- **Level 1:** Surface-Container (#F3F4F6) used for sidebars and background panels.
- **Level 2:** Surface (#FFFFFF) with a 1px border (#E5E7EB). This is used for cards and main content areas.
- **Level 3 (Overlay):** Modals or dropdowns use a White background with a slightly darker 1px border (#D1D5DB) and a very tight, crisp shadow (4px blur, 10% opacity) to provide just enough separation from the UI below.

## Shapes

The shape language follows a **"Soft" (0.25rem)** profile. This subtle rounding removes the aggressive sharpness of a 0px radius while maintaining a structured, architectural feel.

- **Standard Elements:** Buttons, inputs, and small cards use a 4px (0.25rem) radius.
- **Large Containers:** Large dashboard cards or modals can use a 8px (0.5rem) radius for a more refined look.
- **Interactive States:** Maintain the same radius; do not change shape on hover.

## Components

- **Buttons:**
  - **Primary:** Neon Green (#00C853) background with Deep Charcoal (#111827) text for maximum visibility.
  - **Secondary:** White background with a 1px Gray border (#E5E7EB) and Charcoal text.
- **Input Fields:**
  - Background is White, 1px Gray border (#E5E7EB). On focus, the border changes to Charcoal (#111827) with a 2px stroke.
- **Chips / Tags:**
  - Small, rectangular with 4px radius. Use Surface-Container (#F3F4F6) for neutral tags and a light Green tint for success states.
- **Lists:**
  - Use 1px horizontal dividers (#E5E7EB). Row hover states should use a subtle gray background (#F9FAFB).
- **Cards:**
  - Minimalist. No heavy shadows. Defined by a 1px border. Titles should be in `label-md` uppercase format for a technical vibe.
- **Data Tables:**
  - High density. Alternate row striping is not used; instead, use clear borders and `mono-label` typography for numerical values.