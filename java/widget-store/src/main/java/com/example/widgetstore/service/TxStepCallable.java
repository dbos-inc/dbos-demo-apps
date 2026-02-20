package com.example.widgetstore.service;

import org.jooq.DSLContext;

@FunctionalInterface
public interface TxStepCallable<T, E extends Exception> {
    T execute(DSLContext dsl) throws E;
}
