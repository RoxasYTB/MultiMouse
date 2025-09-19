declare const _default: {
    files: string[];
    ignores: string[];
    plugins: {
        'unused-imports': import("eslint").ESLint.Plugin;
    };
    rules: {
        'no-unused-vars': string;
        'unused-imports/no-unused-imports': string;
        'unused-imports/no-unused-vars': (string | {
            vars: string;
            args: string;
            ignoreRestSiblings: boolean;
        })[];
    };
}[];
export default _default;
//# sourceMappingURL=eslint.config.d.ts.map