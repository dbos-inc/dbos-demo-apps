package org.example;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

import java.util.logging.Level;
import java.util.logging.Logger;

class DurableStarterServiceImpl implements DurableStarterService {

    private static final Logger logger = Logger.getLogger(DurableStarterServiceImpl.class.getSimpleName());
    public static final String STEPS_EVENT = "steps_event";

    private final DBOS dbos;

    public DurableStarterServiceImpl(DBOS dbos) {
        this.dbos = dbos;
    }

    private void sleepStep(Integer step) {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.log(Level.SEVERE, "Step {0} interrupted", step);
        }
        logger.log(Level.INFO, "Completed Step {0} of {1}!", new Object[]{step, DBOS.workflowId()});
    }

    @Workflow
    @Override
    public void exampleWorkflow() {
        dbos.runStep(() -> sleepStep(1), "stepOne");
        dbos.setEvent(STEPS_EVENT, 1);
        dbos.runStep(() -> sleepStep(2), "stepTwo");
        dbos.setEvent(STEPS_EVENT, 2);
        dbos.runStep(() -> sleepStep(3), "stepThree");
        dbos.setEvent(STEPS_EVENT, 3);
    }
}
