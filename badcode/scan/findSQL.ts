/* eslint-disable no-console */

import * as ts from 'typescript';

// Overall TODO list:
// Source structure:
//   Ultimately this code goes to the SDK, not the example directory
//   Invokable from npx
//   Use in the deployment script, if we want to enforce rather than suggest
// Invocation:
//   Include all project files in scan (from project definition), not just the argv[]
//     see analyzeProgram below
//   Use the project config
//   Integrate the detected issues into lint-like results / vs.code
//   Make SQL API list (or other rules configuration) a json file instead of a hardcode
// Detection
//   Include undecorated functions
//   Do the best we can to link
//     Make detection of API calls and unsafe constructs more sophisticated
//   Looking for:
//     Unsafe API usage against the DB
//     SQL injection possibility
//     Await not in a communicator/transaction
//   There may be a limitation on callback functions; how are we to know that a callback isn't saved for later?
//     (We are limiting transaction function to some constant we can establish at compile time, not variable)
//     Generate a useful report about what tables are accessed by whom
//   Low-level tasks
//     Listing out of allowed awaits
//     Listing out of properties of database calls
//     Analyze properties of functions
//     Taint user data symbols at entrypoints
//     Top-down control-flow visit

import {
  DiagnosticsCollector,
  diagResult,
  logDiagnostics,
} from '@dbos-inc/dbos-sdk/dist/src/staticAnalysis/tsDiagUtil';

import {
  ClassInfo,
  MethodInfo,
  ParameterInfo,
  DecoratorInfo,
  findPackageInfo,
  //TypeParser, // This gets the basic DBOS structure, not the depth I want
}
from '@dbos-inc/dbos-sdk/dist/src/staticAnalysis/TypeParser';

const libraryNames = ['pg', 'typeorm', 'knex', 'prisma'];

function funcDefContainsDirectAwait(checker: ts.TypeChecker, node: ts.Node) {
  // Check if the node is a function or method declaration
  if (!ts.isFunctionDeclaration(node) && !ts.isMethodDeclaration(node)) {
    throw new Error("Call this on the function / method declaration, not anything else");
  }

  let seenAny = false;

  if (node.body) {
    visit(node.body);
  }

  function visit(node: ts.Node) {
    if (ts.isAwaitExpression(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) {
          console.log(`'await' found in function/method: ${symbol.getName()}`);
      }
      seenAny = true;
    }
    ts.forEachChild(node, visit);
  }

  return seenAny;
}

function isParameterizedQuery(checker: ts.TypeChecker, node: ts.Node): boolean {
  // Check if the node is a call expression with parameters
  if (ts.isCallExpression(node)) {
    const { arguments: args } = node;
    const sig = checker.getResolvedSignature(node);
    console.log(sig?.declaration);
    // Look for patterns that resemble a parameterized query
    // This is a simplistic check and might need refinement based on the SQL library used
    return args.some(arg => ts.isStringLiteral(arg) || ts.isArrayLiteralExpression(arg));
  }
  return false;
}

// Too simplistic!
function isDirectConcatenation(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    // Check if either side of the plus token is a string literal, indicating concatenation
    return ts.isStringLiteral(node.left) || ts.isStringLiteral(node.right);
  }
  return false;
}

function analyzeDatabaseCall(checker: ts.TypeChecker, node: ts.Node, _fileName: string): string {
  // Example logic to determine the nature of the database call
  if (isParameterizedQuery(checker, node)) {
    return 'safe';
  } else if (isDirectConcatenation(node)) {
    return 'unsafe';
  }
  return 'unknown';
}

function analyzeFunction(checker: ts.TypeChecker, node: ts.Node, fileName: string) {
  let functionStatus = 'safe'; // Default assumption

  ts.forEachChild(node, child => {
    if (ts.isExpressionStatement(child)) {
      const status = analyzeDatabaseCall(checker, child, fileName);
      if (status === 'unsafe') {
        functionStatus = 'unsafe';
      } else if (status === 'complex' && functionStatus !== 'unsafe') {
        functionStatus = 'complex';
      }
    }
  });

  ts.forEachChild(node, child => {
    if (ts.isCallExpression(child)) {
      analyzeFunctionCall(child, fileName);
    }
  });

  console.log(`Function in ${fileName} is: ${functionStatus}`);
}

function analyzeFunctionCall(node: ts.CallExpression, _fileName: string) {
  // Example logic to analyze a function call
  if (node.expression && ts.isIdentifier(node.expression)) {
    const _functionName = node.expression.text;
    // Analyze the function based on its name, arguments, etc.
  }

  node.arguments.forEach(arg => {
    if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg)) {
      // Analyze the function passed as an argument
    }
  });
}

function analyzeNode(checker: ts.TypeChecker, node: ts.Node, fileName: string) {
  // Function to analyze individual AST nodes
  if (ts.isFunctionDeclaration(node) && node.body) {
    // Traverse function body for database calls
    ts.forEachChild(node.body, child => {
      if (ts.isExpressionStatement(child)) {
        // Add logic to identify database interactions
        // For example, look for method calls that are known to interact with the database
      }
    });
  }

  if (ts.isFunctionDeclaration(node) && node.body) {
    analyzeFunction(checker, node, fileName);
  }

  // Add more conditions as needed for other types of nodes
}

async function analyzeFile(checker: ts.TypeChecker, sourceFileInfo: FileInfo) {
  const sourceFile = sourceFileInfo.sourceFile;
  ts.forEachChild(sourceFile, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importPath = node.moduleSpecifier.text;
      if (libraryNames.includes(importPath)) {
        sourceFileInfo.dbUsage.modules.push(new DBUsageEntry(node, importPath, sourceFileInfo));
        //console.log(`Detected usage of ${importPath} in file: ${sourceFile.fileName}`);
      }
    }
  });

  ts.forEachChild(sourceFile, node => {
    analyzeNode(checker, node, sourceFile.fileName);
  });
}

function isStaticMethod(node: ts.MethodDeclaration): boolean {
  const mods = node.modifiers ?? [];
  return mods.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
}

class DBUsageEntry {
  constructor(readonly node: ts.Node, readonly dbLibrary: string, readonly file: FileInfo) {
  }
}

class DBUsage {
  modules : DBUsageEntry[] = [];
}

class FileInfo {
  classes : ClassInfo[] = [];
  dbUsage : DBUsage = new DBUsage();

  constructor (readonly sourceFile: ts.SourceFile) {

  }
}
class SDKStructure {
  files : FileInfo[] = [];
  overallClasses : ClassInfo[] = [];
  overallDBUsage : DBUsage = new DBUsage();

  log() {
    for (const file of this.files) {
      console.log(`File: ${file.sourceFile.fileName}`);
      for (const dblib of file.dbUsage.modules) {
        console.log(`  Usage of ${dblib.dbLibrary} module in ${dblib.file.sourceFile.fileName}`);
      }
      for (const cls of file.classes) {
        console.log(`  Class ${cls.name}`);
        for (const mtd of cls.methods) {
          console.log(`    Method ${mtd.name}`);
        }
      }
    }
  }
}

/**
 * Think of this as the bottom-up part - what is here and what is known beyond what TS provides
 */
export class SDKMethodFinder {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly diagc = new DiagnosticsCollector();
  get diags() { return this.diagc.diags; }

  constructor(program: ts.Program) {
    this.program = program;
    this.checker = program.getTypeChecker();
  }

  async parse(): Promise<SDKStructure | undefined> {
    const str = new SDKStructure();
    for (const file of this.program.getSourceFiles()) {
      if (file.isDeclarationFile) continue;
  
      const fi = new FileInfo(file);
      await analyzeFile(this.checker, fi);
  
      for (const stmt of file.statements) {
        if (ts.isClassDeclaration(stmt)) {
          const staticMethods = stmt.members
            .filter(ts.isMethodDeclaration)
            // DBOS only supports static methods, so filter out instance methods by default
            .filter(isStaticMethod)
            .map(m => this.getMethod(m));

          fi.classes.push({
            node: stmt,
            // a class may not have a name if it's the default export
            name: stmt.name?.getText(),
            decorators: this.getDecorators(stmt),
            methods: staticMethods,
          });
        }
      }

      str.files.push(fi);
      str.overallClasses.push(...fi.classes);
      str.overallDBUsage.modules.push(...fi.dbUsage.modules);
    }

    if (str.overallClasses.length === 0) {
      this.diagc.warn(`no classes found in ${JSON.stringify(this.program.getRootFileNames())}`);
    }
    else {
      //this.diagc.warn(`Found ${classes.length} classes`);
      console.log(`Found ${str.overallClasses.length} classes`);
    }

    return diagResult(str, this.diags);
  }

  getMethod(node: ts.MethodDeclaration): MethodInfo {
    const name = node.name.getText();
    const decorators = this.getDecorators(node);
    const parameters = node.parameters.map(p => this.getParameter(p));
    return { node, name, decorators, parameters };
  }

  getParameter(node: ts.ParameterDeclaration): ParameterInfo {
    const decorators = this.getDecorators(node);
    const name = node.name.getText();
    const required = !node.questionToken && !node.initializer;
    return { node, name, decorators, required };
  }

  getDecoratorIdentifier(node: ts.Decorator): { identifier: ts.Identifier; args: readonly ts.Expression[]; } | undefined {
    if (ts.isCallExpression(node.expression)) {
      if (ts.isIdentifier(node.expression.expression)) {
        return { identifier: node.expression.expression, args: node.expression.arguments };
      }
      this.diagc.raise(`Unexpected decorator CallExpression.expression type: ${ts.SyntaxKind[node.expression.expression.kind]}`, node);
    }

    if (ts.isIdentifier(node.expression)) {
      return { identifier: node.expression, args: [] };
    }
    this.diagc.raise(`Unexpected decorator expression type: ${ts.SyntaxKind[node.expression.kind]}`, node);
  }

  getDecorators(node: ts.HasDecorators): DecoratorInfo[] {
    return (ts.getDecorators(node) ?? [])
      .map(node => {
        const decoratorIdentifier = this.getDecoratorIdentifier(node);
        if (!decoratorIdentifier) return undefined;
        const { identifier, args } = decoratorIdentifier;
        const { name, module } = getImportSpecifier(identifier, this.checker) ?? {};
        return { node, identifier, name, module, args } as DecoratorInfo;
      })
      .filter((d): d is DecoratorInfo => !!d);

    function getImportSpecifier(node: ts.Node, checker: ts.TypeChecker): { name: string; module: string; } | undefined {
      const symbol = checker.getSymbolAtLocation(node);
      const decls = symbol?.getDeclarations() ?? [];
      for (const decl of decls) {
        if (ts.isImportSpecifier(decl)) {
          // decl.name is the name for this type used in the local module.
          // If the type name was overridden in the local module, the original type name is stored in decl.propertyName.
          // Otherwise, decl.propertyName is undefined.
          const name = (decl.propertyName ?? decl.name).getText();

          // comment in TS AST declaration indicates moduleSpecifier *must* be a string literal
          //    "If [ImportDeclaration.moduleSpecifier] is not a StringLiteral it will be a grammar error."
          const module = decl.parent.parent.parent.moduleSpecifier as ts.StringLiteral;

          return { name, module: module.text };
        }
      }
      return undefined;
    }
  }
}

/** This is the top down part */
class CodeScanner {
  readonly #diags = new DiagnosticsCollector();
  readonly #checker: ts.TypeChecker;
  get diags() { return this.#diags.diags; }

  constructor(readonly program: ts.Program) {
    this.#checker = program.getTypeChecker();
  }

  scan(decs: SDKStructure, name: string, version:string) {
    console.log(`Scanning app: ${name}-${version}`);
    for (const file of decs.files) {
      console.log(`  Scanning file: ${file.sourceFile.fileName}`);
      for (const cls of file.classes) {
        console.log(`    Scanning class: ${cls.name}`);
        for (const mtd of cls.methods) {
          console.log(`      Scanning method: ${mtd.name}`);
          if (funcDefContainsDirectAwait(this.#checker, mtd.node)) {
            console.log(`        ** Found direct await in ${mtd.name}`);
          }
        }
      }
    }
  }
}

async function analyzeProgram(entrypoints: string[]) {
  const { name, version } = await findPackageInfo(entrypoints);
  console.log(`Found ${name}-${version}`);

  const program = ts.createProgram(entrypoints, {});

  const finder = new SDKMethodFinder(program);
  const stres = await finder.parse();
  logDiagnostics(finder.diags);
  if (!stres || stres.overallClasses.length === 0) return undefined;
  //stres.log();
  
  const scanner = new CodeScanner(program);
  scanner.scan(stres, name, version);
  logDiagnostics(scanner.diags);
}

/* Example of lint can be found at: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#traversing-the-ast-with-a-little-linter */

analyzeProgram(process.argv.slice(2)).then()
.catch(
  (e) => {console.log(e);}
);
