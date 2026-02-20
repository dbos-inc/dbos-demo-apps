package com.example.widgetstore.service;

import org.jooq.DSLContext;
import org.springframework.stereotype.Service;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.json.JSONUtil;

/**
 * Provides transactional step operations with configurable schema support.
 */
@Service
public class TxStepProvider {
    
    // private static final Logger logger = LoggerFactory.getLogger(TxStepProvider.class);

    private final DSLContext dsl;

    public TxStepProvider(DSLContext dsl) {
        this.dsl = dsl;
    }

    public void createTxResultsTable() {
        dsl.connection(c -> TxResult.createTxResultsTable(c, null));
    }

    public <T, X extends Exception> T runTxStep(TxStepCallable<T, X> callable, String name) {
        return DBOS.runStep(() -> {

            // if we're not in a workflow, execute the callable directly w/o DBOS bookkeeping
            if (DBOS.inWorkflow() == false) {
                return dsl.transactionResult(cfg -> callable.execute(cfg.dsl()));
            }

            final var wfid = DBOS.workflowId();
            final var stepid = DBOS.stepId();

            var result = dsl.connectionResult(conn -> TxResult.getTxResult(conn, null, wfid, stepid));
            if (result != null) {
                return result.getReturnValue();
            }

            try {
                return dsl.transactionResult(cfg -> {
                    var dsl = cfg.dsl();
                    var retVal = callable.execute(dsl);
                    var output = JSONUtil.serialize(retVal);
                    dsl.connection(conn -> TxResult.saveTxResult(conn, null, wfid,stepid, output, null));
                    return retVal;
                });
            } catch (Exception e) {
                var error = JSONUtil.serializeAppException(e);
                dsl.connection(conn -> TxResult.saveTxResult(conn, null, wfid,stepid, null, error));
                throw e;
            }
        }, name);
    }

    public <X extends Exception> void runTxStep(TxStepRunnable<X> runnable, String name) {
        runTxStep(runnable.asCallable(), name);
    }
}