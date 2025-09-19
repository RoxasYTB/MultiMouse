"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const eslint_plugin_unused_imports_1 = __importDefault(require("eslint-plugin-unused-imports"));
exports.default = [
    {
        files: ['**/*.ts'],
        ignores: ['node_modules/**', 'dist/**', 'build/**'],
        plugins: { 'unused-imports': eslint_plugin_unused_imports_1.default },
        rules: {
            'no-unused-vars': 'off', // désactive la règle de base
            'unused-imports/no-unused-imports': 'error', // supprime les imports non utilisés
            'unused-imports/no-unused-vars': ['off', {
                    vars: 'all',
                    args: 'after-used',
                    ignoreRestSiblings: true
                }],
        },
    },
];
//# sourceMappingURL=eslint.config.js.map