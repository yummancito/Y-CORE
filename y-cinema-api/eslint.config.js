// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'prisma/**/*.ts', 'scripts/**/*.ts'],
    plugins: { import: importPlugin },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.test.json',
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Regla dura del ADR: providers/ es un adaptador puro, nunca puede
      // depender de la capa de negocio (services/modules) ni de routes.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/providers',
              from: ['./src/services', './src/modules', './src/routes', './src/admin'],
              message:
                'providers/ es un adaptador aislado: no puede importar de services/modules/routes/admin (ver ADR.md sección 2.2).',
            },
            {
              target: './src/database',
              from: ['./src/routes', './src/admin'],
              message: 'database/ no puede depender de la capa HTTP.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'src/generated/**'],
  },
)
