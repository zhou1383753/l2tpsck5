package main

import (
	"flag"
	"log"
	"net/http"
	"path/filepath"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"singbox-webui/internal/handler"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	baseDir := flag.String("dir", ".", "webui base directory")
	flag.Parse()

	absDir, err := filepath.Abs(*baseDir)
	if err != nil {
		log.Fatal(err)
	}

	api, err := handler.New(absDir)
	if err != nil {
		log.Fatal(err)
	}
	defer api.Close()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Get("/api/license", api.License)
	r.Post("/api/license", api.License)
	r.Get("/api/license/bootstrap", api.License)
	r.Post("/api/license/bootstrap", api.License)
	r.Get("/api/license/check", api.License)
	r.Post("/api/license/check", api.License)

	r.Get("/api/version", api.Version)
	r.Get("/api/stats", api.Stats)
	r.Get("/api/traffic", api.Traffic)
	r.Post("/api/action", api.Action)
	r.Post("/api/ros", api.Ros)

	fileServer := http.FileServer(http.Dir(absDir))
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path == "/" {
			http.ServeFile(w, req, filepath.Join(absDir, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, req)
	})

	log.Printf("singbox-webui rewrite listening on %s, baseDir=%s", *addr, absDir)
	if err := http.ListenAndServe(*addr, r); err != nil {
		log.Fatal(err)
	}
}
