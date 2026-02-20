package com.example.widgetstore.service;

import org.jooq.DSLContext;

public interface TxStepRunnable<E extends Exception> {
    void execute(DSLContext dsl) throws E;

    default TxStepCallable<Void, E> asCallable() {
        return dsl -> {
            execute(dsl);
            return null;
        };
    }
}