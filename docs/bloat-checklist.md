# Bloat Checklist

Use this to keep the codebase lean and avoid unnecessary security surface and maintenance.

| Item | Question to ask | How to check |
|------|-----------------|---------------|
| **Unused dependencies** | Does package.json list packages that are imported nowhere? | Run `npx depcheck` in `apps/api`. Remove any unused deps. |
| **Oversized responses** | Are API responses returning 40 fields when the frontend uses 8? | Review response shapes; add view DTOs or `?fields=` if needed. |
| **Over-engineering** | Is there abstraction added for a problem that does not exist yet? | Prefer concrete code; extract only when the second use appears. |
| **Bundle size** | Is the frontend shipping code that is never executed? | When you have a frontend: use tree-shaking, analyze bundle (e.g. `vite-bundle-visualizer`). |
| **Duplicate middleware** | Is the same validation or transformation happening in multiple layers? | Audit route handlers vs shared schemas; validate once (e.g. Zod at edge). |

---

## Unused dependencies (API)

Every unused dependency is a security surface and a maintenance burden.

**Check:**
```bash
cd apps/api && npx depcheck
```

- **No depcheck issue** → All listed packages are used; you’re good.
- **Unused dependencies** → Remove them with `npm uninstall <pkg>`.
- **Unused devDependencies** → Same; remove if not used by scripts or tooling.

Run after adding or removing features.

---

## Oversized responses

- Prefer returning only fields that the client needs (e.g. separate “list” vs “detail” shapes).
- If many clients need different subsets, consider `?fields=id,name,email` or dedicated view endpoints instead of one huge DTO.

---

## Over-engineering

- Avoid “we might need this later” layers (extra interfaces, generic helpers) until there’s a second call site.
- Keep routes, services, and repos focused; refactor when duplication appears.

---

## Duplicate validation/transformation

- Validate request body/query once (e.g. Zod in route or shared schema).
- Don’t re-validate the same thing in a service if the route already did.
- Centralize error codes and messages so the same condition isn’t translated in multiple places.
