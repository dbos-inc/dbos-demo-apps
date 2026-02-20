package com.example.widgetstore.service;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

import dev.dbos.transact.database.SystemDatabase;
import dev.dbos.transact.json.JSONUtil;

public record TxResult(String output, String error) {
    @SuppressWarnings("unchecked")
    public <T, X extends Exception> T getReturnValue() throws X {
        if (error != null) {
            var throwable = JSONUtil.deserializeAppException(error);
            if (!(throwable instanceof Exception)) {
                throw new RuntimeException(throwable.getMessage(), throwable);
            } else {
                throw (X) throwable;
            }
        }

        if (output != null) {
            var array = JSONUtil.deserializeToArray(output);
            return array == null ? null : (T) array[0];
        }

        return null;
    }

    public static void createTxResultsTable(Connection connection, String schema) throws SQLException {
        var sanitizedSchema = SystemDatabase.sanitizeSchema(schema);

        // Create schema if it doesn't exist
        String createSchemaSQL = "CREATE SCHEMA IF NOT EXISTS %s".formatted(sanitizedSchema);
        try (PreparedStatement stmt = connection.prepareStatement(createSchemaSQL)) {
            stmt.executeUpdate();
        }

        // Create table in the specified schema
        String sql = """
                CREATE TABLE IF NOT EXISTS %s.tx_results (
                    workflow_uuid TEXT NOT NULL,
                    function_id INTEGER NOT NULL,
                    output TEXT,
                    error TEXT,
                    PRIMARY KEY (workflow_uuid, function_id)
                )""".formatted(sanitizedSchema);
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.executeUpdate();
        }
    }

    public static void saveTxResult(Connection connection, String schema, String workflowUuid, int functionId,
            String output, String error) throws SQLException {
        String sanitizedSchema = SystemDatabase.sanitizeSchema(schema);
        String sql = "INSERT INTO %s.tx_results (workflow_uuid, function_id, output, error) VALUES (?, ?, ?, ?)"
                .formatted(sanitizedSchema);
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, workflowUuid);
            stmt.setInt(2, functionId);
            stmt.setString(3, output);
            stmt.setString(4, error);
            stmt.executeUpdate();
        }
    }

    public static TxResult getTxResult(Connection connection, String schema, String workflowUuid, int functionId)
            throws SQLException {
        String sanitizedSchema = SystemDatabase.sanitizeSchema(schema);
        String sql = "SELECT output, error FROM %s.tx_results WHERE workflow_uuid = ? AND function_id = ?"
                .formatted(sanitizedSchema);
        try (PreparedStatement stmt = connection.prepareStatement(sql)) {
            stmt.setString(1, workflowUuid);
            stmt.setInt(2, functionId);
            try (var rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return new TxResult(
                            rs.getString("output"),
                            rs.getString("error"));
                }
                return null;
            }
        }
    }
}
