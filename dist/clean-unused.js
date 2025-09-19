"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const reportPath = './eslint-report.json';
// Supprimer le rapport précédent s'il existe
if (fs.existsSync(reportPath)) {
    fs.unlinkSync(reportPath);
}
try {
    (0, child_process_1.execSync)('npx eslint . --ext .ts --ignore-pattern node_modules/* --rule "no-unused-vars: 2" -f json > eslint-report.json 2>nul', {
        stdio: 'ignore'
    });
}
catch {
    // Ignorer les erreurs ESLint
}
if (!fs.existsSync(reportPath)) {
    process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
for (const file of report) {
    if (!file.messages.length)
        continue;
    let code = fs.readFileSync(file.filePath, 'utf8').split('\n');
    let changed = false;
    for (const msg of file.messages) {
        if (msg.ruleId !== 'no-unused-vars')
            continue;
        const lineIndex = msg.line - 1;
        const varNameMatch = msg.message.match(/'(.+?)'/);
        if (!varNameMatch)
            continue;
        const varName = varNameMatch[1];
        let line = code[lineIndex].trim();
        let declType = 'variable';
        // Vérifier si c'est une fonction
        const funcRegex = new RegExp(`^(?:async\\s+)?(?:export\\s+)?(?:function\\s+|const\\s+${varName}\\s*=\\s*(?:async\\s+)?\\(|let\\s+${varName}\\s*=\\s*(?:async\\s+)?\\()`);
        if (funcRegex.test(line)) {
            let depth = 0;
            let endLine = lineIndex;
            for (let i = lineIndex; i < code.length; i++) {
                for (const char of code[i]) {
                    if (char === '{')
                        depth++;
                    if (char === '}')
                        depth--;
                }
                if (depth === 0 && i > lineIndex) {
                    endLine = i;
                    break;
                }
            }
            for (let i = lineIndex; i <= endLine; i++) {
                code[i] = '';
            }
            changed = true;
            declType = 'fonction';
            continue;
        }
        // Traiter les variables/constantes
        const regex = new RegExp(`\\b(let|const|var)\\s+${varName}\\s*=[^,;]*[;,]?`);
        const match = code[lineIndex].match(regex);
        if (match) {
            code[lineIndex] = code[lineIndex].replace(regex, '');
            if (/^\\s*(const|let|var)\\s*;?\\s*$/.test(code[lineIndex])) {
                code[lineIndex] = '';
            }
            changed = true;
            if (match[1] === 'const')
                declType = 'constante';
            else if (match[1] === 'let' || match[1] === 'var')
                declType = 'variable';
        }
    }
    if (changed) {
        // Supprimer les lignes vides consécutives
        code = code.filter((line, i, arr) => {
            if (line.trim() !== '')
                return true;
            return i > 0 && arr[i - 1].trim() !== '';
        });
        fs.writeFileSync(file.filePath, code.join('\n'), 'utf8');
    }
}
// Supprimer le rapport
fs.unlinkSync(reportPath);
//# sourceMappingURL=clean-unused.js.map