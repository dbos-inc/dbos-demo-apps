# My Go Project

This project is a simple Go application that demonstrates the use of functions and local package imports.

## Purpose

The application imports the `dbos-transact` package and defines a workflow that consists of two steps. The main function orchestrates the execution of these steps.

## Structure

- `main.go`: Contains the main function and the workflow logic.
- `go.mod`: Module definition and dependencies.
- `go.sum`: Dependency checksums.

## Usage

To run the application, navigate to the project directory and use the following command:

```
go run main.go
```

Make sure that the `dbos-transact` package is available at the specified local path: `/Users/max/codeZ/dbos-transact-golang`.