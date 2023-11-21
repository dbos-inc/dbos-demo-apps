CREATE OR REPLACE FUNCTION prov_func() RETURNS TRIGGER AS $$
DECLARE
    num_rows INTEGER;
    msg  TEXT;
BEGIN
    SELECT count(*) from affected_rows INTO num_rows;
    IF num_rows > 1 THEN
        SELECT FORMAT('{"schema":"%s", "table":"%s", "count":%s, "op":"%s"}', TG_TABLE_SCHEMA, TG_TABLE_NAME, num_rows, TG_OP) INTO msg;
        PERFORM pg_logical_emit_message(true, 'wal2json', msg);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE PROCEDURE create_update_trigger_all_tables ()
language plpgsql as $$
declare
  _sql text;
begin
  for _sql in select concat (
      'create or replace trigger tg_',
      quote_ident(table_name),
      '_update AFTER UPDATE ON ',
      quote_ident(table_name),
      ' REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE PROCEDURE prov_func();'
    )
    from
      information_schema.tables
    where  
      table_schema not in ('pg_catalog', 'information_schema', 'operon') and    
      table_schema not like 'pg_toast%' and table_name not like 'knex_%'
  loop
    execute _sql;
  end loop;
end;
$$;

CREATE OR REPLACE PROCEDURE create_insert_trigger_all_tables ()
language plpgsql as $$
declare
  _sql text;
begin
  for _sql in select concat (
      'create or replace trigger tg_',
      quote_ident(table_name),
      '_insert AFTER INSERT ON ',
      quote_ident(table_name),
      ' REFERENCING NEW TABLE AS affected_rows FOR EACH STATEMENT EXECUTE PROCEDURE prov_func();'
    )
    from
      information_schema.tables
    where  
      table_schema not in ('pg_catalog', 'information_schema', 'operon') and    
      table_schema not like 'pg_toast%' and table_name not like 'knex_%'
  loop
    execute _sql;
  end loop;
end;
$$;

CREATE OR REPLACE PROCEDURE create_delete_trigger_all_tables()
language plpgsql as $$
declare
  _sql text;
begin
  for _sql in select concat (
      'create or replace trigger tg_',
      quote_ident(table_name),
      '_delete AFTER DELETE ON ',
      quote_ident(table_name),
      ' REFERENCING OLD TABLE AS affected_rows FOR EACH STATEMENT EXECUTE PROCEDURE prov_func();'
    )
    from
      information_schema.tables
    where  
      table_schema not in ('pg_catalog', 'information_schema', 'operon') and    
      table_schema not like 'pg_toast%' and table_name not like 'knex_%'
  loop
    execute _sql;
  end loop;
end;
$$;

call create_update_trigger_all_tables();
call create_insert_trigger_all_tables();
call create_delete_trigger_all_tables();