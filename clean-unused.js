import { execSync } from 'child_process';
import fs from 'fs';

const reportPath = './eslint-report.json';
if (fs.existsSync(reportPath)) {
  fs.unlinkSync(reportPath);
}

console.log(
  'Analyse des erreurs ESLint sur les valeurs inutilisées en cours (fonctions et variables/constantes)...',
);

try {
  execSync(
    'npx eslint . --ext .js --ignore-pattern node_modules/* --rule "no-unused-vars: 2" -f json > eslint-report.json 2>nul',
    { stdio: 'ignore', shell: true },
  );
} catch {
  console.log('Analyse ESLint terminée.');
}

if (!fs.existsSync(reportPath)) {
  console.error('❌ Aucun rapport ESLint trouvé.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

for (const file of report) {
  if (!file.messages.length) continue;

  let code = fs.readFileSync(file.filePath, 'utf8').split('\n');
  let changed = false;

  for (const msg of file.messages) {
    if (msg.ruleId !== 'no-unused-vars') continue;

    const lineIndex = msg.line - 1;
    const varName = msg.message.match(/'(.+?)'/)[1];
    let line = code[lineIndex].trim();

    let declType = 'variable';

    const funcRegex = new RegExp(`^(?:async\\s+)?function\\s+${varName}\\b`);
    if (funcRegex.test(line)) {
      let depth = 0;
      let endLine = lineIndex;

      for (let i = lineIndex; i < code.length; i++) {
        for (const char of code[i]) {
          if (char === '{') depth++;
          if (char === '}') depth--;
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
      console.log(
        `[CLEAN] La ${declType} trouvée à ${file.filePath} nommée ${varName} a été supprimée car inutilisée.`,
      );
      continue;
    }

    const regex = new RegExp(
      `\\b(let|const|var)\\s+${varName}\\s*=[^,;]*[;,]?`,
    );
    const match = code[lineIndex].match(regex);
    if (match) {
      code[lineIndex] = code[lineIndex].replace(regex, '');
      if (/^\\s*(const|let|var)\\s*;?\\s*$/.test(code[lineIndex])) {
        code[lineIndex] = '';
      }
      changed = true;
      if (match[1] === 'const') declType = 'constante';
      else if (match[1] === 'let' || match[1] === 'var') declType = 'variable';
      console.log(
        `[CLEAN] La ${declType} trouvée à ${file.filePath} nommée ${varName} a été supprimée car inutilisée.`,
      );
    }
  }

  if (changed) {
    code = code.filter((line, i, arr) => {
      if (line.trim() !== '') return true;
      return i > 0 && arr[i - 1].trim() !== '';
    });

    fs.writeFileSync(file.filePath, code.join('\n'), 'utf8');
    console.log(`[CLEAN] ${file.filePath}`);
  }
}

console.log('Nettoyage terminé.');

fs.unlinkSync(reportPath);
