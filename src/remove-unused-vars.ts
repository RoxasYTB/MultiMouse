import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

for (const sourceFile of project.getSourceFiles('src*.ts')) {
  let changed = false;

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.VariableDeclaration) {
      const decl = node.asKindOrThrow(SyntaxKind.VariableDeclaration);
      const name = decl.getNameNode();

      const symbol = name.getSymbol();
      if (symbol) {
        const referencedSymbols = project.getLanguageService().findReferences(name);
        let totalRefs = 0;
        for (const refSym of referencedSymbols) {
          totalRefs += refSym.getReferences().length;
        }

        if (totalRefs === 1) {
          decl.remove();
          changed = true;
        }
      }
    }

    if (node.getKind() === SyntaxKind.Parameter) {
      const param = node.asKindOrThrow(SyntaxKind.Parameter);
      const name = param.getNameNode();

      const symbol = name.getSymbol();
      if (symbol) {
        const referencedSymbols = project.getLanguageService().findReferences(name);
        let totalRefs = 0;
        for (const refSym of referencedSymbols) {
          totalRefs += refSym.getReferences().length;
        }
        if (totalRefs === 1) {
          param.remove();
          changed = true;
        }
      }
    }
  });

  if (changed) {
    sourceFile.saveSync();
    console.log('Nettoyé :', sourceFile.getFilePath());
  }
}

