import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

for (const sourceFile of project.getSourceFiles('src*.ts')) {
  let changed = false;

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.TryStatement) {
      const tryStmt = node.asKindOrThrow(SyntaxKind.TryStatement);
      const catchClause = tryStmt.getCatchClause();

      if (catchClause && catchClause.getBlock().getStatements().length === 0) {
        tryStmt.replaceWithText(tryStmt.getTryBlock().getText());
        changed = true;
      }
    }
  });

  if (changed) {
    sourceFile.saveSync();
    console.log('Nettoyé :', sourceFile.getFilePath());
  }
}

