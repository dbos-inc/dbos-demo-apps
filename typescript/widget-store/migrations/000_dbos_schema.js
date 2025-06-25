const {
  KnexDataSource
} = require('@dbos-inc/knex-datasource');

exports.up = async function(knex) {
  await KnexDataSource.initializeSchema(knex);
};

exports.down = async function(knex) {
  await KnexDataSource.uninitializeSchema(knex);
};