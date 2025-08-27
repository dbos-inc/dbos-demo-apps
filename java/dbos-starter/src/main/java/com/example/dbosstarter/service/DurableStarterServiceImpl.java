package com.example.dbosstarter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.dbos.transact.context.DBOSContext;
import dev.dbos.transact.workflow.Step;
import dev.dbos.transact.workflow.Workflow;

public class DurableStarterServiceImpl implements DurableStarterService {

    private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);

    private DurableStarterService self;

    public void setDurableStarterService(DurableStarterService service) {
        this.self = service;
    }

    @Workflow(name = "exampleWorkflow")
    public void exampleWorkflow() {
        var dbos = DBOSContext.dbosInstance().get();

        self.stepOne();
        dbos.setEvent(STEPS_EVENT, 1);
        self.stepTwo();
        dbos.setEvent(STEPS_EVENT, 2);
        self.stepThree();
        dbos.setEvent(STEPS_EVENT, 3);
    }

    @Step(name = "stepOne")
    public void stepOne() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); 
            logger.error("stepOne interrupted", e);
        }
        logger.info("Completed step 1!");
    }

    @Step(name = "stepTwo")
    public void stepTwo() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); 
            logger.error("stepTwo interrupted", e);
        }
        logger.info("Completed step 2!");
    }

    @Step(name = "stepThree")
    public void stepThree() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); 
            logger.error("stepThree interrupted", e);
        }
        logger.info("Completed step 3!");
    }
}
