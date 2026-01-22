package com.example.dbos_starter.controller

import com.example.dbos_starter.service.DurableStarterService
import com.example.dbos_starter.service.STEPS_EVENT
import dev.dbos.transact.DBOS
import dev.dbos.transact.StartWorkflowOptions
import dev.dbos.transact.execution.ThrowingRunnable
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Duration
import dev.dbos.transact.startWorkflow

private val logger = LoggerFactory.getLogger(DurableStarterController::class.java)

@RestController
@CrossOrigin(origins = ["*"])
class DurableStarterController(private val service: DurableStarterService) {

    @GetMapping("/workflow/{taskId}")
    fun runWorkflow(@PathVariable taskId: String): ResponseEntity<Void> {
        startWorkflow(taskId) { service.exampleWorkflow() }
        return ResponseEntity.ok().build()
    }

    @GetMapping("/last_step/{taskId}")
    fun lastStep(@PathVariable taskId: String): ResponseEntity<String> {
        val step = DBOS.getEvent(taskId, STEPS_EVENT, Duration.ofSeconds(0)) as Int?
        return ResponseEntity.ok((step ?: 0).toString())
    }

    @PostMapping("/crash")
    fun crash(): ResponseEntity<Void> {
        logger.warn("Crash endpoint called - terminating application")
        Runtime.getRuntime().halt(0)
        return ResponseEntity.ok().build()
    }
}