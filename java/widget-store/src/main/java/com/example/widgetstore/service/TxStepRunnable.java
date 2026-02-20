package com.example.widgetstore.service;

import org.jooq.DSLContext;

@FunctionalInterface
public interface TxStepRunnable<E extends Exception> {
    void execute(DSLContext dsl) throws E;
}