package main

import (
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.StaticFile("/", "./html/app.html")

	r.Run(":8080")
}
