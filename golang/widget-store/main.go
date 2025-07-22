package main

import (
	"github.com/dbos-inc/dbos-transact-go/dbos"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	err := dbos.Launch()
	if err != nil {
		panic(err)
	}
	defer dbos.Shutdown()

	r.StaticFile("/", "./html/app.html")

	r.Run(":8080")
}
