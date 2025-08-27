package com.example.dbosstarter.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.dbosstarter.service.DurableStarterService;

import dev.dbos.transact.DBOS;
import dev.dbos.transact.context.SetWorkflowID;

import static com.example.dbosstarter.service.DurableStarterService.STEPS_EVENT;

@RestController
@CrossOrigin(origins = "*")
public class DurableStarterController {

    private static final Logger logger = LoggerFactory.getLogger(DurableStarterController.class);

    @Autowired
    private DurableStarterService service;

    @Autowired
    private DBOS dbos;

    @GetMapping("/workflow/{taskId}")
    public ResponseEntity<Void> startWorkflow(@PathVariable String taskId) {
        try (var id = new SetWorkflowID(taskId)) {
            dbos.startWorkflow(() -> { service.exampleWorkflow(); return null; });
            return ResponseEntity.ok().build();
        }
    }

    @GetMapping("/last_step/{taskId}")
    public ResponseEntity<String> lastStep(@PathVariable String taskId) {
        var step = (Integer) dbos.getEvent(taskId, STEPS_EVENT, 0.0f);
        return ResponseEntity.ok(String.valueOf(step != null ? step : 0));
    }

    @PostMapping("/crash")
    public ResponseEntity<Void> crash() {
        logger.warn("Crash endpoint called - terminating application");
        Runtime.getRuntime().halt(0);
        return ResponseEntity.ok().build();
    }
}
