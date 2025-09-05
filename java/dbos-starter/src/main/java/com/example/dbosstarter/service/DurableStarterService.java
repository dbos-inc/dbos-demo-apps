package com.example.dbosstarter.service;

public interface DurableStarterService {

    public static final String STEPS_EVENT = "steps_event";

    void setDurableStarterService(DurableStarterService service);

    void exampleWorkflow();

    void stepOne();
    void stepTwo();
    void stepThree();

}
