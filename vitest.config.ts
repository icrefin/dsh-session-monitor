import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The page test compiles JSX; the automatic runtime matches the bundle build
  // and keeps `React` out of scope, so both halves see one React instance.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    include: ['test/**/*.spec.ts', 'test/**/*.spec.tsx'],
  },
})