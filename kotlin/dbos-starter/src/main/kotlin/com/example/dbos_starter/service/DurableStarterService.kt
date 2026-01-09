package com.example.dbos_starter.service

import dev.dbos.transact.DBOS
import dev.dbos.transact.execution.ThrowingRunnable
import dev.dbos.transact.workflow.Workflow
import org.slf4j.LoggerFactory

const val STEPS_EVENT = "steps_event"
private val logger = LoggerFactory.getLogger(DurableStarterServiceImpl::class.java)

interface DurableStarterService {
    fun exampleWorkflow()
}

class DurableStarterServiceImpl : DurableStarterService {

    private fun stepOne() {
        try {
            Thread.sleep(5000)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.error("stepOne interrupted", e)
        }
        logger.info("Completed step 1!")
    }

    private fun stepTwo() {
        try {
            Thread.sleep(5000)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.error("stepTwo interrupted", e)
        }
        logger.info("Completed step 2!")
    }

    private fun stepThree() {
        try {
            Thread.sleep(5000)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            logger.error("stepThree interrupted", e)
        }
        logger.info("Completed step 3!")
    }

    @Workflow
    override fun exampleWorkflow() {
        DBOS.runStep<Exception>({ stepOne() }, "stepOne")
        DBOS.setEvent(STEPS_EVENT, 1)
        DBOS.runStep<Exception>({ stepTwo() }, "stepTwo")
        DBOS.setEvent(STEPS_EVENT, 2)
        DBOS.runStep<Exception>({ stepThree() }, "stepThree")
        DBOS.setEvent(STEPS_EVENT, 3)
    }
}