/* eslint-disable no-console */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

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

function analyzeFile(fileName: string) {
  const fileContents = fs.readFileSync(fileName, 'utf8');
  const sourceFile = ts.createSourceFile(
    fileName,
    fileContents,
    ts.ScriptTarget.Latest
  );

  ts.forEachChild(sourceFile, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const importPath = node.moduleSpecifier.text;
      if (libraryNames.includes(importPath)) {
        console.log(`Detected usage of ${importPath} in file: ${fileName}`);
      }
    }
  });

  ts.forEachChild(sourceFile, node => {
    analyzeNode(node, fileName);
  });
}

function analyzeDirectory(directory: string) {
  fs.readdirSync(directory).forEach(file => {
    const fullPath = path.join(directory, file);
    if (fullPath.endsWith('.ts')) {
      analyzeFile(fullPath);
    }
  });
}

function analyzeProgram(entrypoints: string[]) {
  const program = ts.createProgram(entrypoints);
}

import { readFileSync } from "fs";
import * as ts from "typescript";

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
    ts.ScriptTarget.ES2015,
    /*setParentNodes */ true
  );

  // delint it
  delint(sourceFile);
});

//const directoryToAnalyze = '/home/chuck/dbos/operon-demo-apps/badcode'; // Update this path
//const directoryToAnalyze = process.argv[2]; // The first argument passed to the script
//analyzeDirectory(directoryToAnalyze);

analyzeProgram([process.argv[2]]);

