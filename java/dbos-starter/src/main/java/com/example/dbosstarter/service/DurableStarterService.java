package com.example.dbosstarter.service;

public interface DurableStarterService {

    void setDbosStarterService(DurableStarterService service);

    void exampleWorkflow();

    void stepOne();
    void stepTwo();
    void stepThree();

}
