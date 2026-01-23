package com.example.dbos_starter

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class DurableStarterApplication

fun main(args: Array<String>) {
    runApplication<DurableStarterApplication>(*args)
}
