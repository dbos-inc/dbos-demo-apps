/* eslint-disable no-console */

//import { readFileSync } from "fs";
import * as ts from 'typescript';
//import * as fs from 'fs';
import fs from 'node:fs/promises';
import * as path from 'path';

// Overall TODO list:
//  Do a better job of sharing the code w/ Harry's OpenAPI generator; may take some refactoring of the generator
//   Ultimately this code goes to the SDK, not the example directory
//  Include all project files in scan, not just the entrypoint
//   Include undecorated functions
//  Do the best we can to link
//  Make detection of API calls and unsafe constructs more sophisticated
// Looking for:
//  Unsafe API usage against the DB
//  SQL injection possibility
//  Await not in a communicator/transaction
// There may be a limitation on callback functions; how are we to know that a callback isn't saved for later?
//  (We are limiting transaction function to some constant we can establish at compile time, not variable)
// Integrate the detected issues into lint-like results / vs.code
// Generate a useful report about what tables are accessed by whom
// Figure out if any rules are significant enough to prevent deployment

import {
  DiagnosticsCollector,
  diagResult,
  logDiagnostics,
} from '@dbos-inc/dbos-sdk/dist/src/dbos-runtime/tsDiagUtil';

import {
  //findPackageInfo // TODO share / export this
}
from '@dbos-inc/dbos-sdk/dist/src/dbos-runtime/openApi';

import {
  ClassInfo,
  MethodInfo,
  ParameterInfo,
  DecoratorInfo,
  //TypeParser, // This gets the basic DBOS structure, not the depth I want
}
from '@dbos-inc/dbos-sdk/dist/src/dbos-runtime/TypeParser';

export async function findPackageInfo(entrypoints: string[]): Promise<{ name: string, version: string }> {
  for (const entrypoint of entrypoints) {
    let dirname = path.dirname(entrypoint);
    while (dirname !== '/') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const packageJson = JSON.parse(await fs.readFile(path.join(dirname, 'package.json'), { encoding: 'utf-8' }));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const name = packageJson.name as string ?? "unknown";
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const version = packageJson.version as string | undefined;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const isPrivate = packageJson.private as boolean | undefined ?? false;

        return {
          name,
          version: version
            ? version
            : isPrivate ? "private" : "unknown"
        };
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        if ((error as any).code !== 'ENOENT') throw error;
      }
      dirname = path.dirname(dirname);
    }
  }
  return { name: "unknown", version: "unknown" };
}


const libraryNames = ['pg', 'typeorm', 'knex', 'prisma'];

function isParameterizedQuery(node: ts.Node): boolean {
  // Check if the node is a call expression with parameters
  if (ts.isCallExpression(node)) {
    const { arguments: args } = node;
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

function isComplex(node: ts.Node, depth = 0): boolean {
  const maxDepthAllowed = 3; // Define a threshold for complexity
  if (depth > maxDepthAllowed) {
    return true;
  }

  let isComplexNode = false;
  node.forEachChild(child => {
    if (isComplex(child, depth + 1)) {
      isComplexNode = true;
    }
  });

  return isComplexNode;
}

function analyzeDatabaseCall(node: ts.Node, _fileName: string): string {
  // Example logic to determine the nature of the database call
  if (isParameterizedQuery(node)) {
    return 'safe';
  } else if (isDirectConcatenation(node)) {
    return 'unsafe';
  } else if (isComplex(node)) {
    return 'complex';
  }
  return 'unknown';
}

function analyzeFunction(node: ts.Node, fileName: string) {
  let functionStatus = 'safe'; // Default assumption

  ts.forEachChild(node, child => {
    if (ts.isExpressionStatement(child)) {
      const status = analyzeDatabaseCall(child, fileName);
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

function analyzeNode(node: ts.Node, fileName: string) {
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
    analyzeFunction(node, fileName);
  }

  // Add more conditions as needed for other types of nodes
}

async function analyzeFile(sourceFile:ts.SourceFile) {

  ts.forEachChild(sourceFile, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importPath = node.moduleSpecifier.text;
      if (libraryNames.includes(importPath)) {
        console.log(`Detected usage of ${importPath} in file: ${sourceFile.fileName}`);
      }
    }
  });

  ts.forEachChild(sourceFile, node => {
    analyzeNode(node, sourceFile.fileName);
  });
}

export async function analyzeDirectory(directory: string) {
  (await fs.readdir(directory)).forEach(async file => {
    const fullPath = path.join(directory, file);
    if (fullPath.endsWith('.ts')) {
      const fileContents = await fs.readFile(fullPath, 'utf8');
      const sourceFile = ts.createSourceFile(
        fullPath,
        fileContents,
        ts.ScriptTarget.Latest
      );
    
      analyzeFile(sourceFile);
    }
  });
}

function isStaticMethod(node: ts.MethodDeclaration): boolean {
  const mods = node.modifiers ?? [];
  return mods.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
}

export class TypeParser {
  readonly program: ts.Program;
  readonly checker: ts.TypeChecker;
  readonly diagc = new DiagnosticsCollector();
  get diags() { return this.diagc.diags; }

  constructor(program: ts.Program) {
    this.program = program;
    this.checker = program.getTypeChecker();
  }

  parse(): readonly ClassInfo[] | undefined {
    const classes = new Array<ClassInfo>();
    for (const file of this.program.getSourceFiles()) {
      if (file.isDeclarationFile) continue;
      analyzeFile(file); // TODO MOVE
      for (const stmt of file.statements) {
        if (ts.isClassDeclaration(stmt)) {
          const staticMethods = stmt.members
            .filter(ts.isMethodDeclaration)
            // DBOS only supports static methods, so filter out instance methods by default
            .filter(isStaticMethod)
            .map(m => this.getMethod(m));

          classes.push({
            node: stmt,
            // a class may not have a name if it's the default export
            name: stmt.name?.getText(),
            decorators: this.getDecorators(stmt),
            methods: staticMethods,
          });
        }
      }
    }

    if (classes.length === 0) {
      this.diagc.warn(`no classes found in ${JSON.stringify(this.program.getRootFileNames())}`);
    }
    else {
      //this.diagc.warn(`Found ${classes.length} classes`);
      console.log(`Found ${classes.length} classes`);
    }

    return diagResult(classes, this.diags);
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

class CodeScanner {
  readonly #diags = new DiagnosticsCollector();
  get diags() { return this.#diags.diags; }

  constructor(readonly program: ts.Program) {
    //this.#checker = program.getTypeChecker();
    //const config: Config = {
    //  discriminatorType: 'open-api',
    //  encodeRefs: false
    //};
    //const parser = createParser(program, config, aug => aug.addNodeParser(new BigIntKeywordParser())); // Wonder if needed...
    //const formatter = createFormatter(config, (fmt) => fmt.addTypeFormatter(new BigIntTypeFormatter()));
    //this.#schemaGenerator = new SchemaGenerator(program, parser, formatter, {});
  }

  scan(classes: readonly ClassInfo[], name: string, version:string) {

  }
};

async function analyzeProgram(entrypoints: string[]) {
  const { name, version } = await findPackageInfo(entrypoints);
  console.log(`Found ${name}-${version}`);

  const program = ts.createProgram(entrypoints, {});

  const parser = new TypeParser(program);
  const classes = parser.parse();
  logDiagnostics(parser.diags);
  if (!classes || classes.length === 0) return undefined;

  const scanner = new CodeScanner(program);
  scanner.scan(classes, name, version);
  logDiagnostics(scanner.diags);
}

/*
export function delint(sourceFile: ts.SourceFile) {
  delintNode(sourceFile);

  function delintNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
        if ((node as ts.IterationStatement).statement.kind !== ts.SyntaxKind.Block) {
          report(
            node,
            'A looping statement\'s contents should be wrapped in a block body.'
          );
        }
        break;

      case ts.SyntaxKind.IfStatement:
        const ifStatement = node as ts.IfStatement;
        if (ifStatement.thenStatement.kind !== ts.SyntaxKind.Block) {
          report(ifStatement.thenStatement, 'An if statement\'s contents should be wrapped in a block body.');
        }
        if (
          ifStatement.elseStatement &&
          ifStatement.elseStatement.kind !== ts.SyntaxKind.Block &&
          ifStatement.elseStatement.kind !== ts.SyntaxKind.IfStatement
        ) {
          report(
            ifStatement.elseStatement,
            'An else statement\'s contents should be wrapped in a block body.'
          );
        }
        break;

      case ts.SyntaxKind.BinaryExpression:
        const op = (node as ts.BinaryExpression).operatorToken.kind;
        if (op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) {
          report(node, 'Use \'===\' and \'!==\'.');
        }
        break;
    }

    ts.forEachChild(node, delintNode);
  }

  function report(node: ts.Node, message: string) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    console.log(`${sourceFile.fileName} (${line + 1},${character + 1}): ${message}`);
  }
}

const fileNames = process.argv.slice(2);
fileNames.forEach(fileName => {
  // Parse a file
  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.ES2015, // Seems wrong
    true // setParentNodes
  );

  // delint it
  delint(sourceFile);
});
*/

analyzeProgram([process.argv[2]]);

