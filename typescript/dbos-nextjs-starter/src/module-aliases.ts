import moduleAlias from "module-alias";

// Map TypeScript paths (`src/dbos`) to runtime paths (`dist/dbos`)
moduleAlias.addAliases({
  "@dbos": __dirname + "/dbos",
});

// Apply the alias mapping
moduleAlias();
