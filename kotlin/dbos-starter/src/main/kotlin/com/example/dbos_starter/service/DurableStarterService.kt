package com.example.dbos_starter.service

import dev.dbos.transact.DBOS
import dev.dbos.transact.execution.ThrowingRunnable
import dev.dbos.transact.workflow.Workflow
import org.slf4j.LoggerFactory
import runStep

const val STEPS_EVENT = "steps_event"
private val logger = LoggerFactory.getLogger(DurableStarterServiceImpl::class.java)

interface DurableStarterService {
    fun exampleWorkflow()
}

class DurableStarterServiceImpl : DurableStarterService {

    fun stepOne() {
        Thread.sleep(5000)
        logger.info("Completed step 1!")
    }

    fun stepTwo() {
        Thread.sleep(5000)
        logger.info("Completed step 2!")
    }

    fun stepThree() {
        Thread.sleep(5000)
        logger.info("Completed step 3!")
    }

    @Workflow
    override fun exampleWorkflow() {
        runStep("stepOne") { stepOne() }
        DBOS.setEvent(STEPS_EVENT, 1)
        runStep("stepTwo") { stepTwo() }
        DBOS.setEvent(STEPS_EVENT, 2)
        runStep("stepThree") { stepThree() }
        DBOS.setEvent(STEPS_EVENT, 3)
    }
}