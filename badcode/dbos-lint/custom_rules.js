module.exports = {
  rules: {
    'detect-nondeterministic-calls': {
      // Rule configuration for Math.random() detection
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Detect calls to nondeterministic functions like Math.random(), which should be called via DBOS rather than directly',
        },
        schema: [],
      },
      create: function (context) {
        return {
          CallExpression(node) {
            //console.log(node.callee.type+JSON.stringify(node));
            if (node.callee.type === 'MemberExpression' &&
                node.callee.object.name === 'Math' &&
                node.callee.property.name === 'random')
	          {
              context.report({
                node: node,
                message: 'Avoid calling Math.random() directly; it can lead to non-reproducible behavior.',
              });
            }
            if (node.callee.type === 'Identifier' && 
                node.callee.name === 'setTimeout')
            {
              context.report({
                node: node,
                message: 'Avoid calling setTimeout() directly; it can lead to undesired behavior when debugging.',
              });
            }
          },
        };
      },
    },
    'detect-new-date': {
      // Rule configuration for new Date() detection
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Detect calls to new Date(), which should be called via DBOS rather than directly',
        },
        schema: [],
      },
      create: function (context) {
        return {
          NewExpression(node) {
            if (node.callee.name === 'Date') {
              context.report({
                node: node,
                message: 'Avoid using new Date(); consider using the DBOS SDK functions for consistency and testability.',
              });
            }
          },
        };
      },
    },
  },
};

