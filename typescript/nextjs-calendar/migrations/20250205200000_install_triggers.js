
const { Knex } = require("knex");

/*
 * It is generally not a good idea to seed data into tables in migrations.
 *   We did it for convenience, but please don't follow this example.
 */
exports.up = async function(knex) {
  return knex.raw(
`
CREATE OR REPLACE FUNCTION tf_SchedulerOps_scheduleListener() RETURNS trigger AS $$
DECLARE
    payload json;
BEGIN
IF TG_OP = 'INSERT' THEN
    payload = json_build_object(
        'tname', 'schedule',
        'operation', 'insert',
        'record', row_to_json(NEW)
    );
ELSIF TG_OP = 'UPDATE' THEN
    payload = json_build_object(
        'tname', 'schedule',
        'operation', 'update',
        'record', row_to_json(NEW)
    );
ELSIF TG_OP = 'DELETE' THEN
    payload = json_build_object(
        'tname', 'schedule',
        'operation', 'delete',
        'record', row_to_json(OLD)
    );
END IF;

PERFORM pg_notify('dbos_table_update', payload::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER dbt_SchedulerOps_scheduleListener
AFTER INSERT OR UPDATE OR DELETE ON "schedule"
FOR EACH ROW EXECUTE FUNCTION tf_SchedulerOps_scheduleListener();

CREATE OR REPLACE FUNCTION tf_SchedulerOps_resultListener() RETURNS trigger AS $$
DECLARE
    payload json;
BEGIN
IF TG_OP = 'INSERT' THEN
    payload = json_build_object(
        'tname', 'results',
        'operation', 'insert',
        'record', row_to_json(NEW)
    );
ELSIF TG_OP = 'UPDATE' THEN
    payload = json_build_object(
        'tname', 'results',
        'operation', 'update',
        'record', row_to_json(NEW)
    );
ELSIF TG_OP = 'DELETE' THEN
    payload = json_build_object(
        'tname', 'results',
        'operation', 'delete',
        'record', row_to_json(OLD)
    );
END IF;

PERFORM pg_notify('dbos_table_update', payload::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER dbt_SchedulerOps_resultListener
AFTER INSERT OR UPDATE OR DELETE ON "results"
FOR EACH ROW EXECUTE FUNCTION tf_SchedulerOps_resultListener();
`
);
}

exports.down = async function(knex) {
  return knex.raw(
`
DROP TRIGGER dbt_SchedulerOps_scheduleListener on "schedule";
DROP FUNCTION tf_SchedulerOps_scheduleListener;
DROP TRIGGER dbt_SchedulerOps_resultListener on "results";
DROP FUNCTION tf_SchedulerOps_resultListener;
`
);
}
