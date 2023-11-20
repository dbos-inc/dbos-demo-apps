"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
var fs = require("fs");
var path = require("path");
var libraryNames = ['pg', 'typeorm', 'knex', 'prisma'];
function isParameterizedQuery(node) {
    // Check if the node is a call expression with parameters
    if (ts.isCallExpression(node)) {
        var args = node.arguments;
        // Look for patterns that resemble a parameterized query
        // This is a simplistic check and might need refinement based on the SQL library used
        return args.some(function (arg) { return ts.isStringLiteral(arg) || ts.isArrayLiteralExpression(arg); });
    }
    return false;
}
// Too simplistic!
function isDirectConcatenation(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        // Check if either side of the plus token is a string literal, indicating concatenation
        return ts.isStringLiteral(node.left) || ts.isStringLiteral(node.right);
    }
    return false;
}
function isComplex(node, depth) {
    if (depth === void 0) { depth = 0; }
    var maxDepthAllowed = 3; // Define a threshold for complexity
    if (depth > maxDepthAllowed) {
        return true;
    }
    var isComplexNode = false;
    node.forEachChild(function (child) {
        if (isComplex(child, depth + 1)) {
            isComplexNode = true;
        }
    });
    return isComplexNode;
}
function analyzeDatabaseCall(node, fileName) {
    // Example logic to determine the nature of the database call
    if (isParameterizedQuery(node)) {
        return 'safe';
    }
    else if (isDirectConcatenation(node)) {
        return 'unsafe';
    }
    else if (isComplex(node)) {
        return 'complex';
    }
    return 'unknown';
}
function analyzeFunction(node, fileName) {
    var functionStatus = 'safe'; // Default assumption
    ts.forEachChild(node, function (child) {
        if (ts.isExpressionStatement(child)) {
            var status_1 = analyzeDatabaseCall(child, fileName);
            if (status_1 === 'unsafe') {
                functionStatus = 'unsafe';
            }
            else if (status_1 === 'complex' && functionStatus !== 'unsafe') {
                functionStatus = 'complex';
            }
        }
    });
    console.log("Function in ".concat(fileName, " is: ").concat(functionStatus));
}
function analyzeFunctionCall(node, fileName) {
    // Example logic to analyze a function call
    if (node.expression && ts.isIdentifier(node.expression)) {
        var functionName = node.expression.text;
        // Analyze the function based on its name, arguments, etc.
    }
    node.arguments.forEach(function (arg) {
        if (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg)) {
            // Analyze the function passed as an argument
        }
    });
}
function analyzeNode(node, fileName) {
    // Function to analyze individual AST nodes
    if (ts.isFunctionDeclaration(node) && node.body) {
        // Traverse function body for database calls
        ts.forEachChild(node.body, function (child) {
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
function analyzeFile(fileName) {
    var fileContents = fs.readFileSync(fileName, 'utf8');
    var sourceFile = ts.createSourceFile(fileName, fileContents, ts.ScriptTarget.Latest);
    ts.forEachChild(sourceFile, function (node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            var importPath = node.moduleSpecifier.text;
            if (libraryNames.includes(importPath)) {
                console.log("Detected usage of ".concat(importPath, " in file: ").concat(fileName));
            }
        }
    });
    ts.forEachChild(sourceFile, function (node) {
        analyzeNode(node, fileName);
    });
}
function analyzeDirectory(directory) {
    fs.readdirSync(directory).forEach(function (file) {
        var fullPath = path.join(directory, file);
        if (fullPath.endsWith('.ts')) {
            analyzeFile(fullPath);
        }
    });
}
//const directoryToAnalyze = '/home/chuck/dbos/operon-demo-apps/badcode'; // Update this path
var directoryToAnalyze = process.argv[2]; // The first argument passed to the script
analyzeDirectory(directoryToAnalyze);
