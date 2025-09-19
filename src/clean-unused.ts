import { execSync } from 'child_process';
import * as fs from 'fs';

interface ESLintMessage {
  ruleId: string;
  message: string;
  line: number;
}

interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
}

const reportPath = './eslint-report.json';

if (fs.existsSync(reportPath)) {
  fs.unlinkSync(reportPath);
}

try {
  execSync('npx eslint . --ext .ts --ignore-pattern node_modules/* --rule "no-unused-vars: 2" -f json > eslint-report.json 2>nul', {
    stdio: 'ignore',
  });
} catch {
  
}

if (!fs.existsSync(reportPath)) {
  process.exit(1);
}

const report: ESLintResult[] = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

for (const file of report) {
  if (!file.messages.length) continue;

  let code = fs.readFileSync(file.filePath, 'utf8').split('\n');
  let changed = false;

  for (const msg of file.messages) {
    if (msg.ruleId !== 'no-unused-vars') continue;

    const lineIndex = msg.line - 1;
    const varNameMatch = msg.message.match(/'(.+?)'/);
    if (!varNameMatch) continue;

    const varName = varNameMatch[1];
    let line = code[lineIndex].trim();

    let declType = 'variable';

    
    const funcRegex = new RegExp(`^(?:async\\s+)?(?:export\\s+)?(?:function\\s+|const\\s+${varName}\\s*=\\s*(?:async\\s+)?\\(|let\\s+${varName}\\s*=\\s*(?:async\\s+)?\\()`);
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

      continue;
    }

    
    const regex = new RegExp(`\\b(let|const|var)\\s+${varName}\\s*=[^,;]*[;,]?`);
    const match = code[lineIndex].match(regex);
    if (match) {
      code[lineIndex] = code[lineIndex].replace(regex, '');
      if (/^\\s*(const|let|var)\\s*;?\\s*$/.test(code[lineIndex])) {
        code[lineIndex] = '';
      }
      changed = true;
      if (match[1] === 'const') declType = 'constante';
      else if (match[1] === 'let' || match[1] === 'var') declType = 'variable';
    }
  }

  if (changed) {
    
    code = code.filter((line, i, arr) => {
      if (line.trim() !== '') return true;
      return i > 0 && arr[i - 1].trim() !== '';
    });

    fs.writeFileSync(file.filePath, code.join('\n'), 'utf8');
  }
}

fs.unlinkSync(reportPath);


