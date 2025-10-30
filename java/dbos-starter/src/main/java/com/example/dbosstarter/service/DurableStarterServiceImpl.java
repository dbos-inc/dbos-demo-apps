package com.example.dbosstarter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Step;
import dev.dbos.transact.workflow.Workflow;

public class DurableStarterServiceImpl implements DurableStarterService {

    private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);

    DurableStarterService self;

    public void setDurableStarterService(DurableStarterService service) {
        this.self = service;
    }

    @Workflow
    public void exampleWorkflow() {
        self.stepOne();
        DBOS.setEvent(STEPS_EVENT, 1);
        self.stepTwo();
        DBOS.setEvent(STEPS_EVENT, 2);
        self.stepThree();
        DBOS.setEvent(STEPS_EVENT, 3);
    }

    @Step
    public void stepOne() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); 
            logger.error("stepOne interrupted", e);
        }
        logger.info("Completed step 1!");
    }

    @Step
    public void stepTwo() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); 
            logger.error("stepTwo interrupted", e);
        }
        logger.info("Completed step 2!");
    }

    @Step
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
