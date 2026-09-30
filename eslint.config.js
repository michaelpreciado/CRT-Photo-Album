import js from '@eslint/js'
import globals from 'globals'
import { defineConfig, globalIgnores } from 'eslint/config'

// TypeScript sources are checked by `tsc --noEmit`; ESLint covers the
// plain-JS serverless routes and build config.
export default defineConfig([
  globalIgnores(['dist', 'src']),
  {
    files: ['api/**/*.js', 'vite.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
])
