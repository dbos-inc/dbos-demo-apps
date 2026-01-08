package com.example.dbos_starter.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.workflow.Workflow;

public class DurableStarterServiceImpl implements DurableStarterService {

    private static final Logger logger = LoggerFactory.getLogger(DurableStarterServiceImpl.class);

    private void stepOne() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("stepOne interrupted", e);
        }
        logger.info("Completed step 1!");
    }

    private void stepTwo() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("stepTwo interrupted", e);
        }
        logger.info("Completed step 2!");
    }

    private void stepThree() {
        try {
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logger.error("stepThree interrupted", e);
        }
        logger.info("Completed step 3!");
    }

    @Workflow
    @Override
    public void exampleWorkflow() {
        DBOS.runStep(() -> stepOne(), "stepOne");
        DBOS.setEvent(STEPS_EVENT, 1);
        DBOS.runStep(() -> stepTwo(), "stepTwo");
        DBOS.setEvent(STEPS_EVENT, 2);
        DBOS.runStep(() -> stepThree(), "stepThree");
        DBOS.setEvent(STEPS_EVENT, 3);
    }
}
