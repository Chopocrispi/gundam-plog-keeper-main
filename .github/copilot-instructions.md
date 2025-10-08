# Copilot Instructions for AI Agents

## Project Overview
- This is a Vite + React + TypeScript web app, using shadcn-ui and Tailwind CSS for UI.
The project was generated as a Vite + React + TypeScript app and is maintained in this repository.
- Main entry: `src/main.tsx` mounts the app to `#root` in `index.html`.

## Directory Structure
- `src/` contains all source code:
  - `components/` – React components, including UI primitives in `components/ui/`.
  - `pages/` – Top-level route components (e.g., `Index.tsx`, `NotFound.tsx`).
  - `hooks/` – Custom React hooks.
  - `lib/` and `utils/` – Utility functions and data helpers.
  - `types/` – TypeScript type definitions (e.g., `gundam.ts`).
- Static assets are in `public/`.

## Key Patterns & Conventions
- UI components are organized by type in `src/components/ui/` and follow shadcn-ui conventions.
- Use the `@` alias for imports from `src/` (see `tsconfig.json` and `vite.config.ts`).
- Forms and validation use `zod` and `@hookform/resolvers`.
- Routing is handled by `react-router-dom`.
- Toasts/notifications use `sonner` and custom hooks in `hooks/use-toast.ts`.
  - Charts use `recharts`.
  - Component tagging is enabled in the Vite config via dev tooling (see `vite.config.ts`).

## Developer Workflows
- **Install dependencies:** `npm i`
- **Start dev server:** `npm run dev` (auto-reloads, instant preview)
- **Build for production:** `npm run build`
- **Lint:** `npm run lint`
- **Preview build:** `npm run preview`
 - **Deploy:** Publish the static `dist/` output to your preferred static host (Vercel, Netlify, GitHub Pages, etc.).

## Integration Points
- External UI: shadcn-ui, Radix UI, Tailwind CSS.
-- Data validation: zod.
-- Component tagging: a dev-time plugin may add metadata to components (see `vite.config.ts`).
-- Custom domain and deployment are managed outside this repo; see your hosting provider's docs.

## Examples
- Importing a UI component:
  ```ts
  import { Button } from "@/components/ui/button";
  ```
- Using a custom hook:
  ```ts
  import { useToast } from "@/hooks/use-toast";
  ```
- Defining a page route:
  ```tsx
  <Route path="/" element={<Index />} />
  ```

## References
-- See `README.md` for editing and deployment instructions.
- See `vite.config.ts` and `tsconfig.json` for build and alias configuration.
- UI patterns: `src/components/ui/`
- Types: `src/types/`
- Utilities: `src/utils/`, `src/lib/`

---

**Feedback requested:**
- Are any workflows, conventions, or integration points unclear or missing?
- Is there any project-specific logic or pattern that should be documented for agents?
