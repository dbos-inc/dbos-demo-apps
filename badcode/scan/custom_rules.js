export default {
  rules: {
    'dbos-rules/detect-nondeterministic-calls': {
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
            if (node.callee.type === 'MemberExpression' &&
                node.callee.object.name === 'Math' &&
                node.callee.property.name === 'random')
	          {
              context.report({
                node: node,
                message: 'Avoid calling Math.random() directly; it can lead to non-reproducible behavior.',
              });
            }
          },
        };
      },
    },
    'dbos-rules/detect-new-date': {
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
                message: 'Avoid using new Date(); consider using the DBOS XXX function for consistency and testability.',
              });
            }
          },
        };
      },
    },
  },
};

