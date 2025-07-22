package main

import (
	"os"

	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	dbURL := os.Getenv("DBOS_DATABASE_URL")
	if dbURL == "" {
		panic("DBOS_DATABASE_URL environment variable is required")
	}

	err := dbos.Launch(dbos.WithDatabaseURL(dbURL))
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown()

	r.StaticFile("/", "./html/app.html")

	r.Run(":8080")
}
