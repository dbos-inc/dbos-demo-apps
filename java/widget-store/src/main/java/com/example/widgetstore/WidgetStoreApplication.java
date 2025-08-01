package com.example.widgetstore;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class WidgetStoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(WidgetStoreApplication.class, args);
        System.out.println("🚀 Server is running on http://localhost:3000");
    }
}