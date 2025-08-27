package com.example.dbosstarter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.dbos.transact.context.DBOSContext;
import dev.dbos.transact.workflow.Step;
import dev.dbos.transact.workflow.Workflow;

public class DurableStarterServiceImpl implements DurableStarterService {

    private DurableStarterService self;
    private static final String stepsEvent = "steps_event";
    private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);

    @Override
    public void setDbosStarterService(DurableStarterService self) {
        this.self = self;
    }

    @Workflow
    public void exampleWorkflow() {
        var dbos = DBOSContext.dbosInstance().get();

        self.stepOne();
        dbos.setEvent(stepsEvent, 1);
        self.stepTwo();
        dbos.setEvent(stepsEvent, 2);
        self.stepThree();
        dbos.setEvent(stepsEvent, 3);
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
