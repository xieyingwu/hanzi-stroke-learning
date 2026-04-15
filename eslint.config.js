import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'tests/**', 'js/hanzi-writer.min.js'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        HanziWriter: 'readonly',
        Voice: 'readonly',
        ProgressStore: 'readonly',
        HanziAdapter: 'readonly',
        syncStateFromProgressStore: 'readonly',
        renderCategories: 'readonly',
        renderGrid: 'readonly',
        updateStats: 'readonly',
        updateStarDisplay: 'readonly',
        getAgeBasedDailyMin: 'readonly',
        getDailyLearnTarget: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'off',
    },
  },
];
