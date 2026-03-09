package com.example.widgetstore.aspect;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.jooq.DSLContext;
import org.springframework.stereotype.Component;

import dev.dbos.transact.workflow.WorkflowClassName;

@Aspect
@Component
public class DurableAspect {

    // public DurableAspect(DSLContext dsl) {
    // }

    // @Around("@annotation(zworkf)")
    // public Object handleDurableExecution(ProceedingJoinPoint joinPoint, Durable workflow) throws Throwable {

    //     var workflowName = workflow.name().isEmpty() ? joinPoint.getSignature().getName() : workflow.name();
    //     var klass = joinPoint.getTarget().getClass();
    //     var classNameTag = klass.getAnnotation(WorkflowClassName.class);
    //     var className = classNameTag != null && !classNameTag.value().isEmpty()
    //         ? classNameTag.value()
    //         : klass.getName();

    //     var args = joinPoint.getArgs();

    //     return joinPoint.proceed();


    //     // String taskName = durable.value().isEmpty() ? joinPoint.getSignature().getName() : durable.value();
        
    //     // // 1. Check if this task already completed in our jOOQ history table
    //     // var recordedResult = historyService.findResult(taskName);
        
    //     // if (recordedResult.isPresent()) {
    //     //     System.out.println("Replay detected: Returning cached result for " + taskName);
    //     //     return recordedResult.get();
    //     // }

    //     // // 2. Not executed yet? Proceed with the actual method call
    //     // Object result;
    //     // try {
    //     //     result = joinPoint.proceed();
            
    //     //     // 3. Persist the result so it's durable
    //     //     historyService.saveResult(taskName, result);
            
    //     //     return result;
    //     // } catch (Exception e) {
    //     //     // 4. Handle retries or state marking here
    //     //     throw e; 
    //     // }
    // }
}